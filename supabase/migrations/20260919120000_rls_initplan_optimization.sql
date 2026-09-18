-- Hoist auth.uid() out of per-row policy evaluation.
--
-- WHY: every policy compared a column against a bare auth.uid(). That
-- expands to a COALESCE over current_setting() and a jsonb extraction, and
-- Postgres re-ran it for every row it scanned. On football_shots, the table
-- that grows without bound, that is once per candidate row on every read.
--
-- Confirmed on production before the change:
--
--   Seq Scan on public.football_players
--     Filter: (((COALESCE(NULLIF(current_setting('request.jwt.claim.sub'...
--              ...)))::uuid = football_players.user_id) OR ...)
--
-- and after:
--
--   Seq Scan on public.football_players
--     Filter: (((InitPlan 1).col1 = football_players.user_id) OR ...)
--     InitPlan 1
--       ->  Result
--             Output: (COALESCE(NULLIF(current_setting(...
--
-- A second, unlooked-for win: with the value now a stable parameter instead
-- of a per-row expression, the membership lookup switched from a sequential
-- scan to an Index Scan on football_org_members_user_id_idx - the index
-- added in the previous database phase, which this predicate could not use
-- before.
--
-- SECURITY: auth.uid() is STABLE, so (select auth.uid()) returns the same
-- value for the whole statement. Every predicate below is otherwise exactly
-- what it was - same tables, same columns, same nesting, same permissive/
-- restrictive structure, same policy names. This changes WHEN the value is
-- computed, never WHO can read what. Verified by snapshotting the rows
-- visible to each of the four real accounts before and after: byte-identical.
--
-- ALTER POLICY rather than drop/create, so no policy is ever momentarily
-- absent from a live database.

-- ==========================================
-- football_profiles
-- ==========================================
alter policy "own profile select" on public.football_profiles
  using ((select auth.uid()) = id);
alter policy "own profile insert" on public.football_profiles
  with check ((select auth.uid()) = id);
alter policy "own profile update" on public.football_profiles
  using ((select auth.uid()) = id);

alter policy "org members can view each others profile" on public.football_profiles
  using (id in (
    select football_org_members.user_id
    from public.football_org_members
    where football_org_members.org_id in (
      select football_org_members_1.org_id
      from public.football_org_members football_org_members_1
      where football_org_members_1.user_id = (select auth.uid())
    )
  ));

-- ==========================================
-- football_players
-- ==========================================
alter policy "own players select" on public.football_players
  using ((select auth.uid()) = user_id);
alter policy "own players insert" on public.football_players
  with check ((select auth.uid()) = user_id);
alter policy "own players update" on public.football_players
  using ((select auth.uid()) = user_id);
alter policy "own players delete" on public.football_players
  using ((select auth.uid()) = user_id);

alter policy "org members can view org players" on public.football_players
  using (org_id in (
    select football_org_members.org_id from public.football_org_members
    where football_org_members.user_id = (select auth.uid())
  ));
alter policy "org members can add org players" on public.football_players
  with check (org_id in (
    select football_org_members.org_id from public.football_org_members
    where football_org_members.user_id = (select auth.uid())
  ));
alter policy "org members can update org players" on public.football_players
  using (org_id in (
    select football_org_members.org_id from public.football_org_members
    where football_org_members.user_id = (select auth.uid())
  ));

-- ==========================================
-- football_sessions
-- ==========================================
alter policy "own sessions select" on public.football_sessions
  using ((select auth.uid()) = user_id);
alter policy "own sessions insert" on public.football_sessions
  with check ((select auth.uid()) = user_id);
alter policy "own sessions update" on public.football_sessions
  using ((select auth.uid()) = user_id);

alter policy "org members can view org player sessions" on public.football_sessions
  using (player_id in (
    select football_players.id from public.football_players
    where football_players.org_id in (
      select football_org_members.org_id from public.football_org_members
      where football_org_members.user_id = (select auth.uid())
    )
  ));

-- ==========================================
-- football_shots
-- ==========================================
alter policy "own shots select" on public.football_shots
  using (exists (
    select 1 from public.football_players p
    where p.id = football_shots.player_id and p.user_id = (select auth.uid())
  ));

alter policy "org members can view org player shots" on public.football_shots
  using (player_id in (
    select football_players.id from public.football_players
    where football_players.org_id in (
      select football_org_members.org_id from public.football_org_members
      where football_org_members.user_id = (select auth.uid())
    )
  ));

-- ==========================================
-- football_devices
-- ==========================================
alter policy "owners can view their own devices" on public.football_devices
  using (owner_id = (select auth.uid()));
alter policy "owners can insert their own devices" on public.football_devices
  with check (owner_id = (select auth.uid()));
alter policy "owners can update their own devices" on public.football_devices
  using (owner_id = (select auth.uid()));
alter policy "owners can delete their own devices" on public.football_devices
  using (owner_id = (select auth.uid()));

-- ==========================================
-- football_organizations
-- ==========================================
alter policy "members can view their org" on public.football_organizations
  using (id in (
    select football_org_members.org_id from public.football_org_members
    where football_org_members.user_id = (select auth.uid())
  ));
alter policy "creator can create an org" on public.football_organizations
  with check (owner_id = (select auth.uid()));
alter policy "owner can update their org" on public.football_organizations
  using (owner_id = (select auth.uid()));

-- ==========================================
-- my_org_ids()
--
-- The helper behind football_org_members' own policy, and the reason that
-- policy can query its own table without recursing. Same body, same
-- SECURITY DEFINER, same STABLE marking - only the auth.uid() is hoisted.
-- ==========================================
create or replace function public.my_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.football_org_members where user_id = (select auth.uid());
$$;

-- NOT changed here, deliberately:
--
-- The advisor also reports 30 "multiple permissive policies" findings - the
-- own-row and org-shared policies on players, profiles, sessions and shots
-- are separate permissive policies, so both are evaluated on every read.
-- Merging each pair into one OR'd policy would halve that work, but it
-- changes the shape of the authorization model rather than when a value is
-- computed, and the two are worth reviewing separately from a change that is
-- provably semantics-preserving.
