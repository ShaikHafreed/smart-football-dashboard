-- Server-side aggregates for the analytics screens.
--
-- WHY: every analytics screen used to download raw football_shots rows and
-- aggregate them in the browser with no limit -- the leaderboard read the
-- whole table on every insert, personal bests read every shot the player had
-- ever taken, and the coach dashboard read every shot of every player on the
-- roster. PostgREST caps a response at 1000 rows by default, so past that
-- point those screens did not get slower, they got WRONG: they silently
-- aggregated a slice and presented it as the total. Worse, personal bests
-- ordered ascending, so the slice that survived was the OLDEST thousand
-- kicks, and a player's "best ever" would stop improving without any sign.
--
-- These aggregate in Postgres and return a handful of rows instead.
--
-- SECURITY: every object here is security_invoker, so the caller's own RLS on
-- football_shots / football_players / football_sessions is applied before
-- aggregation, exactly as it is today. These grant no visibility that a
-- direct select did not already grant -- they only move the arithmetic to the
-- side of the wire that can do it correctly.
--
-- The metric definitions are copied from the JavaScript they replace, not
-- reinvented: best score is still max(speed + force) with nulls read as 0,
-- daily figures are still totals divided by counts, and shot types still
-- default to 'kick' when unset.

-- ==========================================
-- PER-PLAYER ROLLUPS
-- ==========================================

-- Personal bests (PlayerAnalytics) and the coach's roster card figures.
create or replace view public.football_player_shot_stats
with (security_invoker = true) as
select
  player_id,
  count(*)::bigint                                      as shot_count,
  coalesce(max(speed), 0)                               as best_speed,
  coalesce(max(spin), 0)                                as best_spin,
  coalesce(max(force), 0)                               as best_force,
  coalesce(max(distance), 0)                            as best_distance,
  coalesce(max(coalesce(speed, 0) + coalesce(force, 0)), 0) as best_combined_score,
  min(created_at)                                       as first_shot_at,
  max(created_at)                                       as last_shot_at
from public.football_shots
where player_id is not null
group by player_id;

-- Session counts, for the coach's attendance chart and roster cards.
create or replace view public.football_player_session_stats
with (security_invoker = true) as
select
  player_id,
  count(*)::bigint    as session_count,
  max(started_at)     as last_session_at
from public.football_sessions
where player_id is not null
group by player_id;

-- The leaderboard, ranked exactly as the client used to rank it:
-- best_score = max(speed + force) over that player's shots. Players with no
-- shots are excluded, matching the old behaviour of iterating shots.
create or replace view public.football_leaderboard
with (security_invoker = true) as
select
  p.id                                                        as player_id,
  p.name                                                      as player_name,
  count(s.id)::bigint                                         as total_shots,
  coalesce(max(coalesce(s.speed, 0) + coalesce(s.force, 0)), 0) as best_score
from public.football_players p
join public.football_shots s on s.player_id = p.id
group by p.id, p.name;

grant select on public.football_player_shot_stats to authenticated;
grant select on public.football_player_session_stats to authenticated;
grant select on public.football_leaderboard to authenticated;

-- ==========================================
-- ROSTER-SCOPED ROLLUPS
-- ==========================================

-- Team speed/spin trend. Takes the caller's time zone rather than bucketing
-- in UTC, because the chart it feeds has always grouped by the viewer's local
-- date -- bucketing server-side in UTC would quietly move kicks between days
-- and change the averages shown.
--
-- Returns totals and counts, not averages: the caller divides, so the result
-- is identical to the arithmetic this replaces (sum of every shot's speed
-- that day / number of shots that day), rather than an average of averages.
create or replace function public.football_shot_daily_totals(
  player_ids uuid[],
  since timestamptz,
  tz text default 'UTC'
)
returns table (
  day date,
  shot_count bigint,
  speed_total numeric,
  spin_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (s.created_at at time zone tz)::date as day,
    count(*)::bigint,
    sum(coalesce(s.speed, 0)),
    sum(coalesce(s.spin, 0))
  from public.football_shots s
  where s.player_id = any(player_ids)
    and s.created_at >= since
  group by 1
  order by 1;
$$;

-- Shot-type distribution across a roster, defaulting an unset type to 'kick'
-- the way the client did.
create or replace function public.football_shot_type_totals(player_ids uuid[])
returns table (
  shot_type text,
  shot_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(s.shot_type, 'kick') as shot_type,
    count(*)::bigint
  from public.football_shots s
  where s.player_id = any(player_ids)
  group by 1
  order by 2 desc;
$$;

grant execute on function public.football_shot_daily_totals(uuid[], timestamptz, text) to authenticated;
grant execute on function public.football_shot_type_totals(uuid[]) to authenticated;
