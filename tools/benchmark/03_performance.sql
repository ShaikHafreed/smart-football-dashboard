-- Query plans and timings at realistic volume, for the exact shapes the
-- frontend issues (see src/lib/analyticsQueries.js).
--
-- Everything runs as `authenticated` inside a transaction, so RLS is in force
-- and the plans include the policy predicates - which is the whole point.
-- Timings come from a laptop container, so treat them as relative evidence
-- about plan shape, not as production latency.

\set ON_ERROR_STOP on
\pset footer off

\set u1 '00000000-0000-4000-8000-000000000001'
\set p1 '20000000-0000-4000-8000-000000000001'

\echo ============ 1. Leaderboard, top 100 ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select player_id, player_name, total_shots, best_score
from public.football_leaderboard
order by best_score desc
limit 100;
commit;

\echo ============ 2. Personal bests (player_shot_stats) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select player_id, shot_count, best_speed, best_spin, best_force, best_distance, last_shot_at
from public.football_player_shot_stats
where player_id in ('20000000-0000-4000-8000-000000000001',
                    '20000000-0000-4000-8000-000000000007');
commit;

\echo ============ 3. Recent shots for the trend chart (limit 15) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select speed, spin, force, distance, shot_type, created_at
from public.football_shots
where player_id in ('20000000-0000-4000-8000-000000000001')
order by created_at desc
limit 15;
commit;

\echo ============ 4. Shot history, first page (25 rows + exact count) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.speed, sh.spin, sh.force, sh.distance, sh.shot_type, sh.created_at, p.id, p.name
from public.football_shots sh
join public.football_players p on p.id = sh.player_id
order by sh.created_at desc
limit 25 offset 0;
commit;

\echo ============ 5. Shot history, deep page (offset 5000) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at
from public.football_shots sh
join public.football_players p on p.id = sh.player_id
order by sh.created_at desc
limit 25 offset 5000;
commit;

\echo ============ 6. History exact count (what the pager reads) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select count(*) from public.football_shots;
commit;

\echo ============ 7. Session list (25 most recent) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select id, player_id, started_at, ended_at
from public.football_sessions
where player_id in ('20000000-0000-4000-8000-000000000001')
order by started_at desc
limit 25;
commit;

\echo ============ 8. Shots for a page of sessions (session_id IN) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select session_id, speed, spin, force, distance, shot_type, created_at
from public.football_shots
where session_id in (
  select id from public.football_sessions
  where player_id = '20000000-0000-4000-8000-000000000001'
  order by started_at desc limit 25)
order by created_at;
commit;

\echo ============ 9. Coach daily totals RPC (14 days, whole roster) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select * from public.football_shot_daily_totals(
  array(select id from public.football_players),
  now() - interval '14 days', 'Asia/Kolkata');
commit;

\echo ============ 10. Shot-type totals RPC (whole roster) ============
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true) \gset
explain (analyze, buffers, costs off)
select * from public.football_shot_type_totals(array(select id from public.football_players));
commit;

\echo ============ 11. Durable session lookup (backend, service role) ============
explain (analyze, buffers, costs off)
select id, player_id, started_at
from public.football_sessions
where device_id = '30000000-0000-4000-8000-000000000001'
  and ended_at is null
order by started_at desc
limit 1;
