import { describe, it, expect, vi, beforeEach } from "vitest";

// The Supabase client is replaced with a recording stub, so these tests
// assert the shape of the queries this module builds -- the limits, ranges
// and filters are the whole point of it, and they are exactly what a runtime
// smoke test would never notice going wrong.
const h = vi.hoisted(() => {
  const state = { queue: [], fallback: { data: [], error: null, count: 0 }, calls: [] };

  class QueryStub {
    constructor(table) {
      this.table = table;
      state.calls.push({ type: "from", table });
    }
    select(cols, opts) { state.calls.push({ type: "select", table: this.table, cols, opts }); return this; }
    order(col, opts) { state.calls.push({ type: "order", table: this.table, col, opts }); return this; }
    limit(n) { state.calls.push({ type: "limit", table: this.table, n }); return this; }
    range(from, to) { state.calls.push({ type: "range", table: this.table, from, to }); return this; }
    eq(col, val) { state.calls.push({ type: "eq", table: this.table, col, val }); return this; }
    in(col, vals) { state.calls.push({ type: "in", table: this.table, col, vals }); return this; }
    ilike(col, val) { state.calls.push({ type: "ilike", table: this.table, col, val }); return this; }
    or(filters) { state.calls.push({ type: "or", table: this.table, filters }); return this; }
    gte(col, val) { state.calls.push({ type: "gte", table: this.table, col, val }); return this; }
    then(resolve, reject) {
      const next = state.queue.length ? state.queue.shift() : state.fallback;
      return Promise.resolve(next).then(resolve, reject);
    }
  }

  return { state, QueryStub };
});

vi.mock("./supabaseClient", () => ({
  supabase: {
    from: (table) => new h.QueryStub(table),
    rpc: (fn, args) => {
      h.state.calls.push({ type: "rpc", fn, args });
      const next = h.state.queue.length ? h.state.queue.shift() : h.state.fallback;
      return Promise.resolve(next);
    },
  },
}));

const { state } = h;

import {
  toDailyAverages,
  formatDayLabel,
  mergeShotStats,
  isCapped,
  groupBy,
  indexByPlayer,
  fetchLeaderboard,
  fetchRecentShots,
  fetchDailyTotals,
  fetchShotHistoryPage,
  fetchShotHistoryCount,
  keysetFilter,
  cursorOf,
  rangeSince,
  HISTORY_RANGES,
  fetchSessionsWithShots,
  fetchPlayerShotStats,
  HISTORY_PAGE_SIZE,
  LEADERBOARD_LIMIT,
  SESSION_LIST_LIMIT,
  RECENT_SHOTS_LIMIT,
} from "./analyticsQueries";

function queue(...results) {
  state.queue = results;
}

function callsOfType(type) {
  return state.calls.filter((c) => c.type === type);
}

beforeEach(() => {
  state.calls = [];
  state.queue = [];
  state.fallback = { data: [], error: null, count: 0 };
});

// ==========================================
// Metric preservation
// ==========================================

describe("toDailyAverages", () => {
  it("divides totals by counts, exactly as the browser-side rollup did", () => {
    const rows = [{ day: "2026-09-18", shot_count: 4, speed_total: 100, spin_total: 400 }];
    expect(toDailyAverages(rows)[0]).toMatchObject({ avgSpeed: 25, avgSpin: 100 });
  });

  it("matches the old client-side algorithm shot for shot", () => {
    // The algorithm this replaced, reproduced verbatim from CoachDashboard.
    const shots = [
      { created_at: "2026-09-18T10:00:00Z", speed: 10, spin: 100 },
      { created_at: "2026-09-18T11:00:00Z", speed: 15, spin: 250 },
      { created_at: "2026-09-18T12:00:00Z", speed: 20, spin: 300 },
    ];
    let speedTotal = 0;
    let spinTotal = 0;
    for (const s of shots) {
      speedTotal += s.speed;
      spinTotal += s.spin;
    }
    const expected = {
      avgSpeed: +(speedTotal / shots.length).toFixed(1),
      avgSpin: +(spinTotal / shots.length).toFixed(1),
    };

    const [actual] = toDailyAverages([
      { day: "2026-09-18", shot_count: shots.length, speed_total: speedTotal, spin_total: spinTotal },
    ]);

    expect(actual.avgSpeed).toBe(expected.avgSpeed);
    expect(actual.avgSpin).toBe(expected.avgSpin);
  });

  it("rounds to one decimal place like the chart always did", () => {
    const rows = [{ day: "2026-09-18", shot_count: 3, speed_total: 100, spin_total: 0 }];
    expect(toDailyAverages(rows)[0].avgSpeed).toBe(33.3);
  });

  it("never divides by zero on an empty day", () => {
    const rows = [{ day: "2026-09-18", shot_count: 0, speed_total: 0, spin_total: 0 }];
    expect(toDailyAverages(rows)[0]).toMatchObject({ avgSpeed: 0, avgSpin: 0 });
  });

  it("handles an empty result set", () => {
    expect(toDailyAverages([])).toEqual([]);
    expect(toDailyAverages(null)).toEqual([]);
  });
});

describe("formatDayLabel", () => {
  it("keeps the day the database reported, not the UTC-shifted one", () => {
    // new Date('2026-09-18') is UTC midnight, which renders as the 17th for
    // anyone west of Greenwich -- the whole reason this parses by field.
    expect(formatDayLabel("2026-09-18")).toBe(new Date(2026, 8, 18).toLocaleDateString());
  });

  it("passes through anything unparseable rather than inventing a date", () => {
    expect(formatDayLabel("not-a-date")).toBe("not-a-date");
    expect(formatDayLabel(undefined)).toBe("");
  });
});

describe("mergeShotStats", () => {
  it("takes the best across every player row the account owns", () => {
    const merged = mergeShotStats([
      { shot_count: 3, best_speed: 10, best_spin: 500, best_force: 200, best_distance: 20 },
      { shot_count: 2, best_speed: 25, best_spin: 100, best_force: 900, best_distance: 5 },
    ]);
    expect(merged).toEqual({ speed: 25, spin: 500, force: 900, distance: 20, shotCount: 5 });
  });

  it("returns zeroes rather than -Infinity for a player with no shots", () => {
    expect(mergeShotStats([])).toEqual({ speed: 0, spin: 0, force: 0, distance: 0, shotCount: 0 });
  });

  it("treats missing values as zero", () => {
    const merged = mergeShotStats([{ shot_count: null, best_speed: null }]);
    expect(merged).toEqual({ speed: 0, spin: 0, force: 0, distance: 0, shotCount: 0 });
  });
});

describe("isCapped", () => {
  it("flags a result that filled its limit, because it may be a slice", () => {
    expect(isCapped([1, 2, 3], 3)).toBe(true);
    expect(isCapped([1, 2], 3)).toBe(false);
    expect(isCapped([], 3)).toBe(false);
  });
});

describe("grouping helpers", () => {
  it("groups rows by key, preserving order", () => {
    const grouped = groupBy(
      [{ session_id: "a", n: 1 }, { session_id: "b", n: 2 }, { session_id: "a", n: 3 }],
      "session_id"
    );
    expect(grouped.a.map((r) => r.n)).toEqual([1, 3]);
    expect(grouped.b).toHaveLength(1);
  });

  it("indexes stat rows by player", () => {
    expect(indexByPlayer([{ player_id: "p1", shot_count: 4 }]).p1.shot_count).toBe(4);
  });

  it("survives empty input", () => {
    expect(groupBy(null, "x")).toEqual({});
    expect(indexByPlayer(undefined)).toEqual({});
  });
});

// ==========================================
// Query shape: limits, ranges, filters
// ==========================================

describe("fetchLeaderboard", () => {
  it("aggregates in the database instead of reading football_shots", async () => {
    await fetchLeaderboard();
    expect(state.calls[0]).toMatchObject({ type: "from", table: "football_leaderboard" });
    expect(state.calls.some((c) => c.table === "football_shots")).toBe(false);
  });

  it("ranks by best score and bounds the result", async () => {
    await fetchLeaderboard();
    expect(callsOfType("order")[0]).toMatchObject({ col: "best_score", opts: { ascending: false } });
    expect(callsOfType("limit")[0].n).toBe(LEADERBOARD_LIMIT);
  });

  it("searches in the database, not over the rows already fetched", async () => {
    await fetchLeaderboard({ search: " sam " });
    expect(callsOfType("ilike")[0]).toMatchObject({ col: "player_name", val: "%sam%" });
  });

  it("does not filter when the search box is empty", async () => {
    await fetchLeaderboard({ search: "   " });
    expect(callsOfType("ilike")).toHaveLength(0);
  });

  it("reports when the result filled the limit", async () => {
    queue({ data: Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => ({ player_id: i })), error: null });
    const { capped } = await fetchLeaderboard();
    expect(capped).toBe(true);
  });

  it("surfaces a failure instead of rendering an empty leaderboard as truth", async () => {
    queue({ data: null, error: { message: "network" } });
    const { data, error } = await fetchLeaderboard();
    expect(error).toBeTruthy();
    expect(data).toEqual([]);
  });
});

describe("fetchRecentShots", () => {
  it("takes the NEWEST shots, not the oldest", async () => {
    // The bug this replaces: ordering ascending and slicing the tail meant
    // that past the row cap the page charted the oldest data instead.
    await fetchRecentShots(["p1"]);
    expect(callsOfType("order")[0]).toMatchObject({ col: "created_at", opts: { ascending: false } });
    expect(callsOfType("limit")[0].n).toBe(RECENT_SHOTS_LIMIT);
  });

  it("returns them oldest-first so the chart reads left to right", async () => {
    queue({
      data: [
        { created_at: "2026-09-18T12:00:00Z", speed: 3 },
        { created_at: "2026-09-18T11:00:00Z", speed: 2 },
        { created_at: "2026-09-18T10:00:00Z", speed: 1 },
      ],
      error: null,
    });
    const { data } = await fetchRecentShots(["p1"]);
    expect(data.map((s) => s.speed)).toEqual([1, 2, 3]);
  });

  it("does not query at all for a player-less account", async () => {
    const { data } = await fetchRecentShots([]);
    expect(data).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });
});

describe("fetchDailyTotals", () => {
  it("asks the database for a bounded window in the viewer's time zone", async () => {
    await fetchDailyTotals(["p1"], { days: 14, timeZone: "Asia/Kolkata" });
    const rpc = callsOfType("rpc")[0];
    expect(rpc.fn).toBe("football_shot_daily_totals");
    expect(rpc.args.tz).toBe("Asia/Kolkata");
    expect(rpc.args.player_ids).toEqual(["p1"]);

    const since = new Date(rpc.args.since).getTime();
    const expected = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(since - expected)).toBeLessThan(5000);
  });

  it("skips the call when there is no roster", async () => {
    await fetchDailyTotals([]);
    expect(callsOfType("rpc")).toHaveLength(0);
  });
});

describe("keyset cursor helpers", () => {
  it("builds a strict 'after this row' predicate with a tiebreak on id", () => {
    // Without the id half, two kicks sharing a timestamp straddle the page
    // boundary and one of them is lost or shown twice.
    expect(keysetFilter({ createdAt: "2026-09-21T10:00:00.123456+00:00", id: "abc" })).toBe(
      "created_at.lt.2026-09-21T10:00:00.123456+00:00," +
      "and(created_at.eq.2026-09-21T10:00:00.123456+00:00,id.lt.abc)"
    );
  });

  it("passes the database timestamp through untouched", () => {
    // Re-parsing it through Date would truncate microseconds to milliseconds
    // and silently skip every row sharing that millisecond.
    const createdAt = "2026-09-21T10:00:00.123456+00:00";
    expect(keysetFilter({ createdAt, id: "x" })).toContain(createdAt);
  });

  it("reads a cursor off a row, and nothing off no row", () => {
    expect(cursorOf({ id: "r1", created_at: "t1" })).toEqual({ id: "r1", createdAt: "t1" });
    expect(cursorOf(undefined)).toBeNull();
  });
});

describe("rangeSince", () => {
  const now = Date.UTC(2026, 8, 21);

  it("returns no bound for all time", () => {
    expect(rangeSince("all", now)).toBeNull();
  });

  it("bounds each window at the right distance back", () => {
    expect(rangeSince("7d", now)).toBe(new Date(now - 7 * 86400000).toISOString());
    expect(rangeSince("90d", now)).toBe(new Date(now - 90 * 86400000).toISOString());
  });

  it("treats an unknown range as unbounded rather than throwing", () => {
    expect(rangeSince("nonsense", now)).toBeNull();
  });

  it("offers all time first, so the default window changes nothing", () => {
    expect(HISTORY_RANGES[0]).toMatchObject({ id: "all", days: null });
  });
});

describe("fetchShotHistoryPage", () => {
  it("orders by created_at then id, so the ordering is total", async () => {
    await fetchShotHistoryPage({});
    expect(callsOfType("order")).toMatchObject([
      { col: "created_at", opts: { ascending: false } },
      { col: "id", opts: { ascending: false } },
    ]);
  });

  it("asks for one row beyond the page, to learn whether there is a next one", async () => {
    await fetchShotHistoryPage({ pageSize: 25 });
    expect(callsOfType("limit")[0]).toMatchObject({ n: 26 });
  });

  it("never uses an offset", async () => {
    await fetchShotHistoryPage({});
    expect(callsOfType("range")).toHaveLength(0);
  });

  it("resumes after the cursor when given one", async () => {
    await fetchShotHistoryPage({ cursor: { createdAt: "t9", id: "i9" } });
    expect(callsOfType("or")[0].filters).toBe("created_at.lt.t9,and(created_at.eq.t9,id.lt.i9)");
  });

  it("starts at the top when there is no cursor", async () => {
    await fetchShotHistoryPage({});
    expect(callsOfType("or")).toHaveLength(0);
  });

  it("trims the probe row off the page it returns", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, created_at: `t${i}` }));
    queue({ data: rows, error: null });
    const { data, hasMore, nextCursor } = await fetchShotHistoryPage({ pageSize: 3 });
    expect(data).toHaveLength(3);
    expect(hasMore).toBe(true);
    // The cursor is the last row SHOWN, not the probe row that was trimmed.
    expect(nextCursor).toEqual({ id: "r2", createdAt: "t2" });
  });

  it("reports the last page as having no next", async () => {
    queue({ data: [{ id: "r0", created_at: "t0" }], error: null });
    const { data, hasMore, nextCursor } = await fetchShotHistoryPage({ pageSize: 3 });
    expect(data).toHaveLength(1);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });

  it("filters by player in the query", async () => {
    await fetchShotHistoryPage({ playerId: "p1" });
    expect(callsOfType("eq")[0]).toMatchObject({ col: "player_id", val: "p1" });
  });

  it("bounds the window when a date range is given", async () => {
    await fetchShotHistoryPage({ since: "2026-01-01T00:00:00Z" });
    expect(callsOfType("gte")[0]).toMatchObject({ col: "created_at", val: "2026-01-01T00:00:00Z" });
  });

  it("searches the whole history via an inner join, not just the current page", async () => {
    await fetchShotHistoryPage({ search: "sam" });
    expect(callsOfType("select")[0].cols).toContain("football_players!inner");
    expect(callsOfType("ilike")[0]).toMatchObject({ col: "football_players.name", val: "%sam%" });
  });

  it("keeps the join non-inner when not searching, so shots are never dropped", async () => {
    await fetchShotHistoryPage({});
    expect(callsOfType("select")[0].cols).not.toContain("!inner");
  });

  it("does not count, so the rows never wait on the total", async () => {
    await fetchShotHistoryPage({});
    expect(callsOfType("select")[0].opts).toBeUndefined();
  });
});

describe("fetchShotHistoryCount", () => {
  it("asks only for the total, not for the rows", async () => {
    await fetchShotHistoryCount({});
    expect(callsOfType("select")[0].opts).toMatchObject({ count: "exact", head: true });
  });

  it("applies the same filters as the page, or the pager would disagree with itself", async () => {
    await fetchShotHistoryCount({ playerId: "p1", search: "sam", since: "2026-01-01T00:00:00Z" });
    expect(callsOfType("eq")[0]).toMatchObject({ col: "player_id", val: "p1" });
    expect(callsOfType("ilike")[0]).toMatchObject({ col: "football_players.name", val: "%sam%" });
    expect(callsOfType("gte")[0]).toMatchObject({ col: "created_at", val: "2026-01-01T00:00:00Z" });
  });

  it("reports a failed count as null, so the caller shows no total rather than zero", async () => {
    queue({ data: null, error: { message: "nope" }, count: null });
    const { count, error } = await fetchShotHistoryCount({});
    expect(error).toBeTruthy();
    expect(count).toBeNull();
  });
});

describe("fetchSessionsWithShots", () => {
  it("bounds the sessions and fetches only those sessions' kicks", async () => {
    queue(
      { data: [{ id: "s1" }, { id: "s2" }], error: null },
      { data: [{ session_id: "s1", speed: 10 }, { session_id: "s2", speed: 20 }], error: null }
    );

    const { data, shotsBySession } = await fetchSessionsWithShots(["p1"]);

    expect(callsOfType("limit")[0].n).toBe(SESSION_LIST_LIMIT);
    expect(callsOfType("in").map((c) => c.col)).toEqual(["player_id", "session_id"]);
    expect(callsOfType("in")[1].vals).toEqual(["s1", "s2"]);
    expect(data).toHaveLength(2);
    expect(shotsBySession.s1[0].speed).toBe(10);
  });

  it("reports that the list is capped so the page can say so", async () => {
    queue(
      { data: Array.from({ length: SESSION_LIST_LIMIT }, (_, i) => ({ id: `s${i}` })), error: null },
      { data: [], error: null }
    );
    const { capped } = await fetchSessionsWithShots(["p1"]);
    expect(capped).toBe(true);
  });

  it("does not ask for shots when there are no sessions", async () => {
    queue({ data: [], error: null });
    const { data, shotsBySession } = await fetchSessionsWithShots(["p1"]);
    expect(data).toEqual([]);
    expect(shotsBySession).toEqual({});
    expect(callsOfType("in")).toHaveLength(1); // player_id only
  });

  it("propagates a session query failure instead of showing an empty list", async () => {
    queue({ data: null, error: { message: "boom" } });
    const { error } = await fetchSessionsWithShots(["p1"]);
    expect(error).toBeTruthy();
  });
});

describe("fetchPlayerShotStats", () => {
  it("reads the aggregate view, scoped to the given players", async () => {
    await fetchPlayerShotStats(["p1", "p2"]);
    expect(state.calls[0]).toMatchObject({ type: "from", table: "football_player_shot_stats" });
    expect(callsOfType("in")[0]).toMatchObject({ col: "player_id", vals: ["p1", "p2"] });
  });

  it("makes no request for an empty roster", async () => {
    await fetchPlayerShotStats([]);
    expect(state.calls).toHaveLength(0);
  });
});
