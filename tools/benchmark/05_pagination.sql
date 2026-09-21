-- OFFSET vs keyset vs a bounded date range, for the shot-history pager.
--
-- The question this answers is not "which is faster in the abstract" - keyset
-- always wins that - but "at the depths this product's UI can actually
-- reach, is the difference worth a cursor protocol?" The History pager has
-- previous/next only and no page jump, so depth costs a click each.
--
-- Everything runs as `authenticated` inside a transaction, so RLS applies and
-- the plans include the policy predicates. Timings are from a laptop
-- container: relative evidence about plan shape, never production latency.
-- The durable numbers are the row counts.

\set ON_ERROR_STOP on
\pset footer off

\set claims '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}'

\echo
\echo ######## cursors: the row at each depth, fetched once up front ########
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
select sh.created_at as c250, sh.id as i250 from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc offset 250 limit 1 \gset
select sh.created_at as c5000, sh.id as i5000 from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc offset 5000 limit 1 \gset
select sh.created_at as c25000, sh.id as i25000 from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc offset 25000 limit 1 \gset
commit;

\echo
\echo ======== A1. OFFSET 0 (page 1) ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc limit 25 offset 0;
commit;

\echo
\echo ======== A2. OFFSET 250 (page 11) ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc limit 25 offset 250;
commit;

\echo
\echo ======== A3. OFFSET 5000 (page 201) ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc limit 25 offset 5000;
commit;

\echo
\echo ======== A4. OFFSET 25000 (page 1001) ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc limit 25 offset 25000;
commit;

\echo
\echo ======== B2. KEYSET at depth 250 ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  where (sh.created_at, sh.id) < (:'c250'::timestamptz, :'i250'::uuid)
  order by sh.created_at desc, sh.id desc limit 25;
commit;

\echo
\echo ======== B3. KEYSET at depth 5000 ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  where (sh.created_at, sh.id) < (:'c5000'::timestamptz, :'i5000'::uuid)
  order by sh.created_at desc, sh.id desc limit 25;
commit;

\echo
\echo ======== B4. KEYSET at depth 25000 ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  where (sh.created_at, sh.id) < (:'c25000'::timestamptz, :'i25000'::uuid)
  order by sh.created_at desc, sh.id desc limit 25;
commit;

\echo
\echo ======== C1. DATE RANGE, last 7 days, page 1 ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select sh.id, sh.created_at, p.name from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  where sh.created_at >= now() - interval '7 days'
  order by sh.created_at desc, sh.id desc limit 25 offset 0;
commit;

\echo
\echo ======== C2. DATE RANGE, last 7 days, exact count ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select count(*) from public.football_shots sh
  where sh.created_at >= now() - interval '7 days';
commit;

\echo
\echo ======== C3. UNBOUNDED exact count, for comparison ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select count(*) from public.football_shots sh;
commit;

\echo
\echo ======== D1. Leaderboard top 100 ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select player_id, player_name, total_shots, best_score
  from public.football_leaderboard order by best_score desc limit 100;
commit;

\echo
\echo ======== D2. Personal bests, one player ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select * from public.football_player_shot_stats
  where player_id = '20000000-0000-4000-8000-000000000001';
commit;

\echo
\echo ======== D3. Shot-type totals, whole roster ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select * from public.football_shot_type_totals(array(select id from public.football_players));
commit;

\echo
\echo ======== D4. Shot-type totals, bounded to 90 days (hypothetical) ========
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset
explain (analyze, buffers, costs off)
select coalesce(s.shot_type, 'kick'), count(*)::bigint
  from public.football_shots s
  where s.player_id = any(array(select id from public.football_players))
    and s.created_at >= now() - interval '90 days'
  group by 1 order by 2 desc;
commit;
