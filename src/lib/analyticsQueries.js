/**
 * Shared, bounded data access for the analytics screens.
 *
 * Every screen here used to build its own unbounded `select` and aggregate the
 * result in the browser. PostgREST caps a response at 1000 rows, so those
 * screens did not degrade past that point — they silently aggregated a slice
 * and presented it as the whole truth. This module exists so that (a) the
 * aggregation happens in Postgres, and (b) where rows genuinely are fetched,
 * the limit is explicit and the caller is told when it was reached.
 *
 * Nothing here changes what a metric MEANS — the definitions are the same ones
 * the components used, moved rather than rewritten — and nothing here widens
 * access: the views and functions it calls are all security_invoker, so the
 * caller's own RLS applies exactly as before.
 */
import { supabase } from "./supabaseClient";

export const HISTORY_PAGE_SIZE = 25;
export const LEADERBOARD_LIMIT = 100;
export const SESSION_LIST_LIMIT = 25;
export const RECENT_SHOTS_LIMIT = 15;
export const TREND_DAYS = 14;

/** The viewer's time zone, so day buckets match the dates they see. */
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A fetch hit its limit, so the caller is holding a slice, not the set. */
export function isCapped(rows, limit) {
  return Array.isArray(rows) && rows.length >= limit;
}

/** 'YYYY-MM-DD' → the same locale label the charts showed before. Parsed
 *  field-by-field: `new Date('2026-09-18')` is UTC midnight, which renders as
 *  the previous day for anyone west of Greenwich. */
export function formatDayLabel(day) {
  if (typeof day !== "string") return String(day ?? "");
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * Daily totals → the averages the trend chart plots. Totals are divided here
 * rather than averaged server-side so the result is "every kick that day,
 * summed, over the number of kicks" — the same arithmetic as before, not an
 * average of per-player averages.
 */
export function toDailyAverages(rows) {
  return (rows || []).map((r) => {
    const count = Number(r.shot_count) || 0;
    return {
      day: formatDayLabel(r.day),
      avgSpeed: count ? +(Number(r.speed_total) / count).toFixed(1) : 0,
      avgSpin: count ? +(Number(r.spin_total) / count).toFixed(1) : 0,
    };
  });
}

/**
 * One account can own several player rows; personal bests are the best across
 * all of them, which is what the old `shots.reduce(max)` produced.
 */
export function mergeShotStats(rows) {
  return (rows || []).reduce(
    (acc, r) => ({
      speed: Math.max(acc.speed, Number(r.best_speed) || 0),
      spin: Math.max(acc.spin, Number(r.best_spin) || 0),
      force: Math.max(acc.force, Number(r.best_force) || 0),
      distance: Math.max(acc.distance, Number(r.best_distance) || 0),
      shotCount: acc.shotCount + (Number(r.shot_count) || 0),
    }),
    { speed: 0, spin: 0, force: 0, distance: 0, shotCount: 0 }
  );
}

/** Index rows by a key, preserving order within each group. */
export function groupBy(rows, key) {
  const grouped = {};
  for (const row of rows || []) {
    (grouped[row[key]] ||= []).push(row);
  }
  return grouped;
}

/** Per-player stat rows keyed by player id, for roster tables. */
export function indexByPlayer(rows) {
  const byPlayer = {};
  for (const row of rows || []) byPlayer[row.player_id] = row;
  return byPlayer;
}

// ==========================================
// Queries
// ==========================================

/** Every query returns this shape, so callers handle failure the same way. */
function result(data, error, extra = {}) {
  return { data: data || [], error: error || null, ...extra };
}

/**
 * Top of the leaderboard, ranked and aggregated in Postgres. Search is a
 * server-side match, not a filter over whatever happened to be fetched.
 */
export async function fetchLeaderboard({ search = "", limit = LEADERBOARD_LIMIT } = {}) {
  let query = supabase
    .from("football_leaderboard")
    .select("player_id, player_name, total_shots, best_score")
    .order("best_score", { ascending: false })
    .limit(limit);

  const term = search.trim();
  if (term) {
    query = query.ilike("player_name", `%${term}%`);
  }

  const { data, error } = await query;
  return result(data, error, { capped: isCapped(data, limit) });
}

export async function fetchPlayerShotStats(playerIds) {
  if (!playerIds?.length) return result([], null);

  const { data, error } = await supabase
    .from("football_player_shot_stats")
    .select("player_id, shot_count, best_speed, best_spin, best_force, best_distance, last_shot_at")
    .in("player_id", playerIds);

  return result(data, error);
}

export async function fetchPlayerSessionStats(playerIds) {
  if (!playerIds?.length) return result([], null);

  const { data, error } = await supabase
    .from("football_player_session_stats")
    .select("player_id, session_count, last_session_at")
    .in("player_id", playerIds);

  return result(data, error);
}

/**
 * The most recent kicks for the trend chart. Fetched newest-first and then
 * reversed, so the cap keeps the NEWEST n — the old code ordered ascending and
 * sliced the tail, which meant that past the row cap it was charting (and
 * taking bests from) the oldest data instead.
 */
export async function fetchRecentShots(playerIds, limit = RECENT_SHOTS_LIMIT) {
  if (!playerIds?.length) return result([], null);

  const { data, error } = await supabase
    .from("football_shots")
    .select("speed, spin, force, distance, shot_type, created_at")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  return result((data || []).slice().reverse(), error);
}

export async function fetchDailyTotals(playerIds, { days = TREND_DAYS, timeZone = localTimeZone() } = {}) {
  if (!playerIds?.length) return result([], null);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("football_shot_daily_totals", {
    player_ids: playerIds,
    since,
    tz: timeZone,
  });

  return result(data, error);
}

export async function fetchShotTypeTotals(playerIds) {
  if (!playerIds?.length) return result([], null);

  const { data, error } = await supabase.rpc("football_shot_type_totals", {
    player_ids: playerIds,
  });

  return result(data, error);
}

/**
 * A bounded page of sessions plus the kicks belonging to exactly those
 * sessions — not every kick the player has ever taken. `capped` tells the
 * caller it is looking at the most recent n, so it can say so.
 */
export async function fetchSessionsWithShots(playerIds, { limit = SESSION_LIST_LIMIT } = {}) {
  if (!playerIds?.length) return result([], null, { shotsBySession: {}, capped: false });

  const { data: sessions, error: sessionError } = await supabase
    .from("football_sessions")
    .select("id, player_id, started_at, ended_at")
    .in("player_id", playerIds)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (sessionError) {
    return result([], sessionError, { shotsBySession: {}, capped: false });
  }

  const sessionIds = (sessions || []).map((s) => s.id);
  if (!sessionIds.length) {
    return result([], null, { shotsBySession: {}, capped: false });
  }

  const { data: shots, error: shotError } = await supabase
    .from("football_shots")
    .select("session_id, speed, spin, force, distance, shot_type, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true });

  return result(sessions, shotError, {
    shotsBySession: groupBy(shots, "session_id"),
    capped: isCapped(sessions, limit),
  });
}

/**
 * One page of shot history. Search matches the player's name in the database
 * via an inner join, so it searches the whole history rather than only the
 * rows already on screen — and the returned count stays consistent with the
 * filter, which is what the pager is built from.
 */
export async function fetchShotHistoryPage({
  page = 0,
  pageSize = HISTORY_PAGE_SIZE,
  playerId = "",
  search = "",
  withCount = true,
} = {}) {
  const term = search.trim();
  const playerJoin = term ? "football_players!inner(id, name)" : "football_players(id, name)";

  // The exact count is a full count of every row the viewer can see, and it
  // cannot change while the filters stay the same. Benchmarked at 300k shots
  // it cost ~1.6s on its own, so paying it once per filter rather than once
  // per page turn is most of the cost of paging.
  let query = supabase
    .from("football_shots")
    .select(`id, speed, spin, force, distance, shot_type, created_at, ${playerJoin}`,
            withCount ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (playerId) query = query.eq("player_id", playerId);
  if (term) query = query.ilike("football_players.name", `%${term}%`);

  const { data, error, count } = await query;
  // null when the count was not requested, so the caller can tell "no rows"
  // from "not counted this time" and keep the total it already has.
  return result(data, error, { count: withCount ? (count || 0) : null });
}
