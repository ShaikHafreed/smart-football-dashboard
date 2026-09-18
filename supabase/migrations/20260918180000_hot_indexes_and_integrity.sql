-- Hot indexes and data-integrity guards.
--
-- Every index below is justified by a query this application actually runs,
-- not by "this column looks indexable". The integrity constraints are all
-- added NOT VALID: they bind every future write immediately without failing
-- the migration on historical rows that nobody can retroactively fix. They
-- can be validated later, once the existing data is known to comply:
--   alter table ... validate constraint ...;

-- ==========================================
-- INDEXES
-- ==========================================

-- football_shots is the largest and fastest-growing table, and every read of
-- it filters by player and orders by time: the history page, the per-session
-- breakdown, personal bests, and the coach's daily rollups. Composite, with
-- created_at descending to match how it is always ordered.
create index if not exists football_shots_player_created_idx
  on public.football_shots (player_id, created_at desc);

-- SessionList fetches the kicks for a page of sessions with
-- "session_id in (...)", and Phase 2's attribution writes one row per kick
-- against a session.
create index if not exists football_shots_session_id_idx
  on public.football_shots (session_id);

-- Not a query the app writes by hand -- this is the RLS policy on
-- football_shots ("own shots select") looking up the owning player for EVERY
-- candidate row. Without it, reading shots means a sequential scan of
-- football_players per row.
create index if not exists football_players_user_id_idx
  on public.football_players (user_id);

-- Session lists and attendance counts, always newest-first per player.
create index if not exists football_sessions_player_started_idx
  on public.football_sessions (player_id, started_at desc);

-- "own sessions select" RLS, and the ownership check in Phase 1's session
-- authorization.
create index if not exists football_sessions_user_id_idx
  on public.football_sessions (user_id);

-- The primary key is (org_id, user_id), which cannot serve a lookup keyed on
-- user_id alone -- which is exactly what my_org_ids() does, on behalf of
-- every org-scoped RLS policy in the schema.
create index if not exists football_org_members_user_id_idx
  on public.football_org_members (user_id);

-- Phase 2's durable session lookup: the open session for one device, newest
-- first. Partial, so it stays tiny (one row per ball currently recording)
-- however large the sessions table grows. This is the hottest read in the
-- system -- it runs on the ingest path.
create index if not exists football_sessions_open_by_device_idx
  on public.football_sessions (device_id, started_at desc)
  where ended_at is null;

-- ==========================================
-- DATA INTEGRITY
-- ==========================================

-- Phase 2 made "the open session for this device" the authoritative answer to
-- which player a kick belongs to, and its start endpoint closes any other open
-- session on that ball. That invariant has so far been enforced only by
-- application code: a client that crashed mid-session, or an older client,
-- could leave two open rows for one device, and attribution would then depend
-- on ordering rather than on truth.
--
-- Close the contradictory ones first -- deterministically, keeping the most
-- recently started row per device, since that is the one Phase 2's lookup
-- would already have chosen. This only ends sessions that are already
-- impossible; no shot, player or session is deleted.
with ranked as (
  select id,
         row_number() over (partition by device_id order by started_at desc, id desc) as rn
  from public.football_sessions
  where ended_at is null
    and device_id is not null
)
update public.football_sessions s
   set ended_at = now()
  from ranked r
 where s.id = r.id
   and r.rn > 1;

-- ...then make the state unrepresentable.
create unique index if not exists football_sessions_one_open_per_device_idx
  on public.football_sessions (device_id)
  where ended_at is null and device_id is not null;

do $$
begin
  -- A session that ended before it started silently corrupts every duration
  -- and every time-bucketed average computed from it.
  if not exists (
    select 1 from pg_constraint where conname = 'football_sessions_end_after_start'
  ) then
    alter table public.football_sessions
      add constraint football_sessions_end_after_start
      check (ended_at is null or ended_at >= started_at) not valid;
  end if;

  -- A shot with no player is invisible to every RLS policy in the schema --
  -- it can never be read, corrected or deleted by anyone, while still
  -- occupying the table. The backend never writes one (Phase 2 requires a
  -- resolved session before persisting), so this closes the door on any other
  -- writer.
  if not exists (
    select 1 from pg_constraint where conname = 'football_shots_player_required'
  ) then
    alter table public.football_shots
      add constraint football_shots_player_required
      check (player_id is not null) not valid;
  end if;

  -- Same class of problem one level up: a player belonging to neither a user
  -- nor an organization satisfies no select policy, so their shots become
  -- unreachable too.
  if not exists (
    select 1 from pg_constraint where conname = 'football_players_reachable'
  ) then
    alter table public.football_players
      add constraint football_players_reachable
      check (user_id is not null or org_id is not null) not valid;
  end if;
end
$$;
