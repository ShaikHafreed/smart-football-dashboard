-- Does the keyset pager return exactly the same rows, in the same order, as
-- the OFFSET pager it replaces?
--
-- Performance is the reason to change pagination; this is the reason it is
-- allowed to ship. A cursor pager that is fast and skips a row is worse than
-- a slow one that does not, and a skipped row in the middle of a history is
-- invisible unless something counts.
--
-- Walks ten pages with the cursor, ten pages with OFFSET, and compares them
-- position by position. Runs as `authenticated` so RLS is in force, which
-- means it also checks that the cursor predicate does not widen visibility.

\set ON_ERROR_STOP on
\pset footer off

\set claims '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}'

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset

create temp table keyset_walk (seq int, id uuid, created_at timestamptz) on commit drop;

do $$
declare
  c_ts timestamptz := null;
  c_id uuid := null;
  n int := 0;
  pg int;
  r record;
begin
  for pg in 1..10 loop
    for r in
      select sh.id, sh.created_at
      from public.football_shots sh
      join public.football_players p on p.id = sh.player_id
      where c_ts is null or (sh.created_at, sh.id) < (c_ts, c_id)
      order by sh.created_at desc, sh.id desc
      limit 25
    loop
      n := n + 1;
      insert into keyset_walk values (n, r.id, r.created_at);
      c_ts := r.created_at;
      c_id := r.id;
    end loop;
  end loop;
end $$;

create temp table offset_walk on commit drop as
select row_number() over (order by w.created_at desc, w.id desc) as seq, w.id, w.created_at
from (
  select sh.id, sh.created_at
  from public.football_shots sh
  join public.football_players p on p.id = sh.player_id
  order by sh.created_at desc, sh.id desc
  limit 250
) w;

\echo
\echo ======== keyset vs OFFSET over the first ten pages ========
select
  (select count(*) from keyset_walk)                                    as keyset_rows,
  (select count(*) from offset_walk)                                    as offset_rows,
  (select count(*) - count(distinct id) from keyset_walk)               as keyset_duplicates,
  (select count(*) from keyset_walk k
     full join offset_walk o on o.seq = k.seq
     where k.id is distinct from o.id)                                  as position_mismatches,
  (select count(*) from offset_walk o
     where not exists (select 1 from keyset_walk k where k.id = o.id))  as rows_offset_saw_keyset_missed;

\echo
\echo ======== ordering is strictly descending and total ========
select count(*) as out_of_order
from keyset_walk a join keyset_walk b on b.seq = a.seq + 1
where not ((a.created_at, a.id) > (b.created_at, b.id));

commit;

-- The same walk with a filter applied, since a cursor that is only correct
-- unfiltered would still be wrong on every screen that uses the filters.
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'claims', true) \gset

create temp table keyset_filtered (seq int, id uuid) on commit drop;

do $$
declare
  c_ts timestamptz := null;
  c_id uuid := null;
  n int := 0;
  pg int;
  r record;
begin
  for pg in 1..6 loop
    for r in
      select sh.id, sh.created_at
      from public.football_shots sh
      join public.football_players p on p.id = sh.player_id
      where sh.player_id = '20000000-0000-4000-8000-000000000001'
        and sh.created_at >= now() - interval '90 days'
        and (c_ts is null or (sh.created_at, sh.id) < (c_ts, c_id))
      order by sh.created_at desc, sh.id desc
      limit 25
    loop
      n := n + 1;
      insert into keyset_filtered values (n, r.id);
      c_ts := r.created_at;
      c_id := r.id;
    end loop;
  end loop;
end $$;

\echo
\echo ======== filtered walk: player + 90-day window ========
select
  (select count(*) from keyset_filtered)                          as rows_walked,
  (select count(*) - count(distinct id) from keyset_filtered)     as duplicates,
  (select count(*) from keyset_filtered k
     join public.football_shots s on s.id = k.id
     where s.player_id <> '20000000-0000-4000-8000-000000000001'
        or s.created_at < now() - interval '90 days')             as rows_outside_the_filter;

commit;
