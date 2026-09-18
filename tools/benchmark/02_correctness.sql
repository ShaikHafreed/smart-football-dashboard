-- Correctness at scale: does RLS still return exactly the right rows, and do
-- the aggregate views agree with an independently computed reference?
--
-- Every expectation is computed from the data by a separate query with
-- explicit predicates, never hard-coded.
--
-- NOTE ON THE HARNESS: each identity probe runs inside an explicit
-- transaction. `SET LOCAL ROLE` outside one is a no-op that emits only a
-- warning, which leaves the query running as the table owner - and the owner
-- bypasses RLS, so the probe would report "everything is visible" and look
-- like a catastrophic leak that is not real. The BEGIN/COMMIT is what makes
-- this a test of RLS rather than of nothing.

\set ON_ERROR_STOP on
\pset footer off

\echo === RLS: expected visibility, computed independently ===
with expected as (
  select u.id as who,
         (select count(*) from public.football_players p
           where p.user_id = u.id
              or p.org_id in (select m.org_id from public.football_org_members m where m.user_id = u.id)
         ) as players,
         (select count(*) from public.football_sessions s
           where s.user_id = u.id
              or s.player_id in (
                   select p.id from public.football_players p
                   where p.org_id in (select m.org_id from public.football_org_members m where m.user_id = u.id))
         ) as sessions,
         (select count(*) from public.football_shots sh
           where exists (select 1 from public.football_players p where p.id = sh.player_id and p.user_id = u.id)
              or sh.player_id in (
                   select p.id from public.football_players p
                   where p.org_id in (select m.org_id from public.football_org_members m where m.user_id = u.id))
         ) as shots
  from auth.users u
  where u.id in ('00000000-0000-4000-8000-000000000001',
                 '00000000-0000-4000-8000-000000000007')
)
select right(who::text, 3) as user_suffix, players as expected_players,
       sessions as expected_sessions, shots as expected_shots
from expected order by who;

\echo --- actual under RLS, user 001 (coach, owns org 1) ---
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
  select (select count(*) from public.football_players)  as actual_players,
         (select count(*) from public.football_sessions) as actual_sessions,
         (select count(*) from public.football_shots)    as actual_shots;
commit;

\echo --- actual under RLS, user 007 (no organization) ---
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true) \gset
  select (select count(*) from public.football_players)  as actual_players,
         (select count(*) from public.football_sessions) as actual_sessions,
         (select count(*) from public.football_shots)    as actual_shots;
commit;

\echo
\echo === RLS: leakage probes as user 007 (all must be 0) ===
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true) \gset

  select count(*) as players_not_mine_or_my_orgs
  from public.football_players p
  where p.user_id is distinct from '00000000-0000-4000-8000-000000000007'::uuid
    and (p.org_id is null
         or p.org_id not in (select m.org_id from public.football_org_members m
                              where m.user_id = '00000000-0000-4000-8000-000000000007'));

  select count(*) as shots_of_players_i_cannot_see
  from public.football_shots sh
  where not exists (select 1 from public.football_players p where p.id = sh.player_id);

  select count(*) as sessions_not_mine
  from public.football_sessions s
  where s.user_id is distinct from '00000000-0000-4000-8000-000000000007'::uuid;

  select count(*) as devices_not_mine
  from public.football_devices d
  where d.owner_id is distinct from '00000000-0000-4000-8000-000000000007'::uuid;

  select count(*) as org_rows_visible from public.football_organizations;
commit;

\echo
\echo === Aggregates vs independent reference (owner context, whole dataset) ===

select 'player_shot_stats' as object,
       count(*) filter (where v.shot_count is distinct from r.shot_count
                          or v.best_speed is distinct from r.best_speed
                          or v.best_spin  is distinct from r.best_spin
                          or v.best_force is distinct from r.best_force) as mismatches,
       count(*) as compared
from public.football_player_shot_stats v
join (
  select player_id, count(*)::bigint as shot_count,
         coalesce(max(speed),0) as best_speed,
         coalesce(max(spin),0)  as best_spin,
         coalesce(max(force),0) as best_force
  from public.football_shots where player_id is not null group by player_id
) r using (player_id);

select 'leaderboard' as object,
       count(*) filter (where v.best_score is distinct from r.best_score
                          or v.total_shots is distinct from r.total_shots) as mismatches,
       count(*) as compared
from public.football_leaderboard v
join (
  select p.id as player_id, count(s.id)::bigint as total_shots,
         coalesce(max(coalesce(s.speed,0) + coalesce(s.force,0)),0) as best_score
  from public.football_players p join public.football_shots s on s.player_id = p.id
  group by p.id
) r using (player_id);

select 'player_session_stats' as object,
       count(*) filter (where v.session_count is distinct from r.n) as mismatches,
       count(*) as compared
from public.football_player_session_stats v
join (select player_id, count(*)::bigint as n from public.football_sessions
      where player_id is not null group by player_id) r using (player_id);

select 'daily_totals' as object,
       count(*) filter (where f.shot_count is distinct from r.shot_count
                          or f.speed_total is distinct from r.speed_total) as mismatches,
       count(*) as compared
from public.football_shot_daily_totals(
       array(select id from public.football_players order by id limit 10),
       now() - interval '365 days', 'UTC') f
full join (
  select (s.created_at at time zone 'UTC')::date as day,
         count(*)::bigint as shot_count, sum(coalesce(s.speed,0)) as speed_total
  from public.football_shots s
  where s.player_id = any(array(select id from public.football_players order by id limit 10))
    and s.created_at >= now() - interval '365 days'
  group by 1
) r using (day);

-- Timezone: counting days is not enough, because two zones can yield the same
-- NUMBER of buckets. Compare the per-day totals themselves.
select 'timezone_shifts_buckets' as object,
       count(*) filter (where u.shot_count is distinct from k.shot_count) as days_differing,
       count(*) as days_compared
from public.football_shot_daily_totals(
       array(select id from public.football_players order by id limit 10),
       now() - interval '365 days', 'UTC') u
full join public.football_shot_daily_totals(
       array(select id from public.football_players order by id limit 10),
       now() - interval '365 days', 'Pacific/Kiritimati') k using (day);

select 'shot_type_totals' as object,
       count(*) filter (where f.shot_count is distinct from r.n) as mismatches,
       count(*) as compared
from public.football_shot_type_totals(array(select id from public.football_players order by id limit 10)) f
join (
  select coalesce(s.shot_type,'kick') as shot_type, count(*)::bigint as n
  from public.football_shots s
  where s.player_id = any(array(select id from public.football_players order by id limit 10))
  group by 1
) r on r.shot_type = f.shot_type;
