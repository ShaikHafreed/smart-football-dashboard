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
 * The date windows the history screen offers. Bounding the window is the only
 * thing that makes the exact count cheap: benchmarked at 1M shots an
 * unbounded count took 1690 ms against 101 ms for a seven-day window, and the
 * bounded one stays flat as the table grows because it reads a window, not a
 * table.
 */
export const HISTORY_RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "7d", label: "Last 7 days", days: 7 },
];

/** Range id -> the ISO lower bound to filter on, or null for no bound. */
export function rangeSince(rangeId, now = Date.now()) {
  const range = HISTORY_RANGES.find((r) => r.id === rangeId);
  if (!range?.days) return null;
  return new Date(now - range.days * 24 * 60 * 60 * 1000).toISOString();
}

/** The position of a row in the history ordering, used to resume after it. */
export function cursorOf(row) {
  return row ? { createdAt: row.created_at, id: row.id } : null;
}

/**
 * "Strictly after this row in (created_at desc, id desc) order", as PostgREST
 * spells it. The id half is not decoration: two kicks can share a timestamp,
 * and without a tiebreaker the boundary row is ambiguous, which is exactly
 * where a pager loses or repeats a row.
 *
 * Values are interpolated raw on purpose. The timestamp keeps the database's
 * own microsecond precision - re-parsing it through Date would truncate to
 * milliseconds and skip every row sharing that millisecond - and neither a
 * PostgREST timestamp nor a uuid can contain the "," "(" ")" that would break
 * out of the filter grammar. postgrest-js appends this through
 * URLSearchParams, so the "+" in a timezone offset is percent-encoded rather
 * than decoded back into a space.
 */
export function keysetFilter({ createdAt, id }) {
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

/**
 * One page of shot history, resumed from a cursor rather than an offset.
 *
 * OFFSET made the database walk and discard every row before the page: at 1M
 * shots, page 1 cost 2 ms and page 1001 cost 1928 ms, and the cost is the
 * depth rather than the table size. A keyset seeks straight to the boundary
 * through the created_at index and reads 25 rows, which measured 0.5-1.9 ms
 * at every depth tested.
 *
 * It is also the correct answer while a session is running. OFFSET counts
 * from the top of a list that new kicks are being inserted into, so a shot
 * arriving between two page turns shifts everything down and the next page
 * repeats a row it already showed. A cursor is anchored to a row, so inserts
 * above it change nothing.
 *
 * Fetches one row more than the page to learn whether a next page exists, so
 * the pager works before - or without - a total count.
 */
export async function fetchShotHistoryPage({
  cursor = null,
  pageSize = HISTORY_PAGE_SIZE,
  playerId = "",
  search = "",
  since = null,
} = {}) {
  const term = search.trim();
  const playerJoin = term ? "football_players!inner(id, name)" : "football_players(id, name)";

  let query = supabase
    .from("football_shots")
    .select(`id, speed, spin, force, distance, shot_type, created_at, ${playerJoin}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (playerId) query = query.eq("player_id", playerId);
  if (term) query = query.ilike("football_players.name", `%${term}%`);
  if (since) query = query.gte("created_at", since);
  if (cursor) query = query.or(keysetFilter(cursor));

  const { data, error } = await query;

  const rows = data || [];
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  return result(page, error, {
    hasMore,
    nextCursor: hasMore ? cursorOf(page[page.length - 1]) : null,
  });
}

/**
 * The total for the pager, as its own request.
 *
 * It used to ride along with the first page, so the rows - which the keyset
 * returns in about a millisecond - waited on a count that took over a second
 * unbounded. Separating them lets the table render immediately and the total
 * arrive when it arrives; nothing about the page depends on it.
 */
export async function fetchShotHistoryCount({ playerId = "", search = "", since = null } = {}) {
  const term = search.trim();
  const playerJoin = term ? "football_players!inner(id, name)" : "football_players(id, name)";

  let query = supabase
    .from("football_shots")
    .select(`id, ${playerJoin}`, { count: "exact", head: true });

  if (playerId) query = query.eq("player_id", playerId);
  if (term) query = query.ilike("football_players.name", `%${term}%`);
  if (since) query = query.gte("created_at", since);

  const { error, count } = await query;
  return { error: error || null, count: error ? null : count || 0 };
}
