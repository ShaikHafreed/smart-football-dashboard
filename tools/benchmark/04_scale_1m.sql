-- Grow the SYNTHETIC dataset from ~300k shots to ~1M, to see whether the
-- query shapes scale linearly or fall off a cliff.
--
-- Run after 01_seed.sql, against the same disposable container. Never run
-- this against production.
--
-- Additive by design: it does not touch the rows 01_seed.sql created, so a
-- 300k measurement taken before this runs and a 1M measurement taken after
-- it are the same queries over the same shape, only deeper. Spacing is 2
-- seconds rather than the seed's 7 so the extra kicks still land inside the
-- one-hour session window.

\set ON_ERROR_STOP on

insert into public.football_shots (player_id, session_id, speed, spin, force, distance, shot_type, created_at, device_id)
select s.player_id,
       s.id,
       idx.speed,
       idx.spin,
       idx.force,
       round((idx.speed * 1.5)::numeric, 2),
       case when (g + abs(hashtext(s.id::text))) % 5 = 0 then 'pass' else 'kick' end,
       s.started_at + (g * interval '2 seconds'),
       s.device_id
from public.football_sessions s
cross join lateral generate_series(1, 1167) g
cross join lateral (
  select
    round((20 + ((abs(hashtext('x' || s.id::text || g::text)) % 8000) / 100.0))::numeric, 2) as speed,
    round((((abs(hashtext('x' || g::text || s.id::text)) % 33300) / 100.0))::numeric, 2)     as spin,
    round((1 + ((abs(hashtext('xf' || s.id::text || g::text)) % 1500) / 100.0))::numeric, 2) as force
) idx;

analyze;

select 'shots' as tbl, count(*) from public.football_shots;
