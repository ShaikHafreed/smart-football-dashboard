import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Radar, Download, Search, ChevronLeft, ChevronRight, ChevronsLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { downloadCsv } from "../utils/csv";
import {
  fetchShotHistoryPage,
  fetchShotHistoryCount,
  rangeSince,
  HISTORY_RANGES,
  HISTORY_PAGE_SIZE,
} from "../lib/analyticsQueries";
import {
  FIRST_PAGE,
  currentCursor,
  advance,
  back,
  toNewest,
  pageRange,
} from "../lib/historyPager";
import PageHeader from "../components/common/PageHeader";
import StateBlock from "../components/common/StateBlock";
import StatusDot from "../components/common/StatusDot";

const PAGE_SIZE = HISTORY_PAGE_SIZE;
const REALTIME_COALESCE_MS = 2000;

export default function History() {
  const [data, setData] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Paging is a stack of cursors rather than an offset, so "previous" costs
  // the same as "next" and neither re-walks the rows before it. The stack
  // itself lives in lib/historyPager.js, as data, so it can be tested.
  const [pager, setPager] = useState(FIRST_PAGE);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // Arrives on its own; the rows never wait for it.
  const [totalCount, setTotalCount] = useState(null);

  // Whether the realtime channel actually reached SUBSCRIBED, rather than
  // whether we asked it to. Nothing is claimed to be live that isn't.
  const [subscribed, setSubscribed] = useState(false);

  const [playerFilter, setPlayerFilter] = useState("");
  const [rangeId, setRangeId] = useState("all");
  const [search, setSearch] = useState("");
  // The term actually sent to the database, a beat behind the input.
  const [appliedSearch, setAppliedSearch] = useState("");

  // One object so every "the filters changed" effect keys off the same thing
  // and they cannot disagree about when to reset.
  const filters = useMemo(
    () => ({ playerId: playerFilter, search: appliedSearch, since: rangeSince(rangeId) }),
    [playerFilter, appliedSearch, rangeId]
  );

  const cursor = currentCursor(pager);

  const loadPage = useCallback(async (at, activeFilters) => {
    setLoading(true);

    const { data: rows, error: loadError, hasMore: more, nextCursor: next } =
      await fetchShotHistoryPage({ cursor: at, pageSize: PAGE_SIZE, ...activeFilters });

    if (loadError) {
      setError("Couldn't load shot history — check your connection and try again.");
      setData([]);
      setHasMore(false);
      setNextCursor(null);
    } else {
      setError("");
      setData(rows);
      setHasMore(more);
      setNextCursor(next);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.from("football_players").select("id, name").order("name").then(({ data }) => setPlayers(data || []));
  }, []);

  // A changed filter invalidates every cursor and the total that went with
  // them, so paging starts over. This happens where the filter changes rather
  // than in an effect watching it, so there is no render that briefly pairs
  // the new filter with the old page.
  const resetPaging = useCallback(() => {
    setPager(FIRST_PAGE);
    setTotalCount(null);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      resetPaging();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, resetPaging]);

  useEffect(() => {
    loadPage(cursor, filters);
  }, [cursor, filters, loadPage]);

  // The total is its own request. It is the expensive half — an unbounded
  // exact count measured 1690 ms at 1M synthetic shots against about 1 ms for
  // the page itself — so it must never be on the path to showing the rows.
  useEffect(() => {
    let cancelled = false;

    fetchShotHistoryCount(filters).then(({ count }) => {
      if (!cancelled) setTotalCount(count);
    });

    return () => { cancelled = true; };
  }, [filters]);

  // New shots appear at the top of page 1 automatically, without a manual
  // refresh — but only while looking at the first page with no filters, so a
  // live insert doesn't reshuffle a coach's filtered view out from under them.
  useEffect(() => {
    if (pager.index !== 0 || playerFilter || appliedSearch) return;

    let pending = null;

    const channel = supabase
      .channel("history-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "football_shots" },
        () => {
          // One refresh per burst of kicks, not one per kick.
          if (pending) return;
          pending = setTimeout(() => {
            pending = null;
            loadPage(null, filters);
            fetchShotHistoryCount(filters).then(({ count }) => setTotalCount(count));
          }, REALTIME_COALESCE_MS);
        }
      )
      .subscribe((status) => setSubscribed(status === "SUBSCRIBED"));

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [pager.index, playerFilter, appliedSearch, filters, loadPage]);

  const filtered = Boolean(appliedSearch || playerFilter || filters.since);
  // The live refresh only runs on the newest page with no player or search
  // filter, so the badge is shown exactly when that is true AND the channel
  // is genuinely connected. A stale `subscribed` cannot make it lie, because
  // eligibility is re-derived every render.
  const liveEligible = pager.index === 0 && !playerFilter && !appliedSearch;
  const showLive = liveEligible && subscribed;
  const { first: firstOnPage, last: lastOnPage } = pageRange(pager, PAGE_SIZE, data.length);
  const showPager = pager.index > 0 || hasMore;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Training"
        title="Shot History"
        description="Every recorded kick, most recent first."
        actions={
          <button
            onClick={() => downloadCsv(data)}
            disabled={data.length === 0}
            className="btn btn-quiet btn-sm"
          >
            <Download aria-hidden="true" className="h-4 w-4" /> Export this page
          </button>
        }
      />

      {/* FILTERS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="history-search" className="sr-only">Search by player name</label>
          <input
            id="history-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all history by player name…"
            className="field !pl-9"
          />
        </div>

        <label htmlFor="history-player" className="sr-only">Filter by player</label>
        <select
          id="history-player"
          value={playerFilter}
          onChange={(e) => { setPlayerFilter(e.target.value); resetPaging(); }}
          className="field sm:w-48"
        >
          <option value="">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Narrowing the window is what keeps the total cheap as history
            grows, and it is also the only way to reach a period other than
            "the most recent kicks" without paging there by hand. */}
        <label htmlFor="history-range" className="sr-only">Filter by date range</label>
        <select
          id="history-range"
          value={rangeId}
          onChange={(e) => { setRangeId(e.target.value); resetPaging(); }}
          className="field sm:w-40"
        >
          {HISTORY_RANGES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* WHAT YOU ARE LOOKING AT — the count fills in when it arrives, and
          until then the rows are still fully usable. The live badge says the
          page updates itself, which nothing on screen used to mention. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {data.length > 0 ? (
          <>
            Showing <span className="font-data tabular-nums text-foreground">{firstOnPage.toLocaleString()}–{lastOnPage.toLocaleString()}</span>
            {totalCount !== null && (
              <> of <span className="font-data tabular-nums text-foreground">{totalCount.toLocaleString()}</span></>
            )}
            {" "}kick{lastOnPage === 1 && totalCount === 1 ? "" : "s"}
            {filtered ? " matching these filters" : ""}
          </>
        ) : null}
      </p>

      {showLive && (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          title="New kicks appear here automatically while this page is open."
        >
          <StatusDot tone="live" pulse />
          Live
        </span>
      )}
      </div>

      {loading && <StateBlock variant="loading" />}

      {error && <StateBlock variant="error" icon={Radar} title="Couldn't load history" message={error} />}

      {!loading && !error && data.length === 0 && (
        <StateBlock
          icon={Radar}
          title={filtered ? "No matching shots" : "No shots recorded yet"}
          message={
            filtered
              ? "Try a different player, a wider date range, or clear the filters."
              : "Run a session with a player selected and every kick lands here."
          }
          action={
            filtered ? (
              <button
                onClick={() => { setSearch(""); setPlayerFilter(""); setRangeId("all"); resetPaging(); }}
                className="btn btn-quiet btn-sm"
              >
                Clear filters
              </button>
            ) : null
          }
        />
      )}

      <div className="space-y-2">
        {data.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <span className="min-w-0 truncate font-medium">{item.football_players?.name || "Unknown"}</span>

            <div className="flex flex-wrap gap-x-4 gap-y-1 font-data text-sm tabular-nums text-muted-foreground">
              <span><span className="text-foreground">{item.spin}</span> rpm</span>
              <span><span className="text-foreground">{item.force}</span> g</span>
              <span>idx <span className="text-foreground">{item.speed}</span></span>
              <span>carry <span className="text-foreground">{item.distance}</span></span>
            </div>

            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </motion.div>
        ))}
      </div>

      {/* PAGINATION — "next" is known from the page itself rather than from
          the total, so it works before the count has arrived. */}
      {showPager && (
        <nav aria-label="Shot history pages" className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted-foreground">Page {pager.index + 1}</span>

          <div className="flex gap-2">
            <button
              onClick={() => setPager(toNewest)}
              disabled={pager.index === 0}
              className="btn btn-quiet btn-sm"
            >
              <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Newest</span>
            </button>
            <button
              onClick={() => setPager(back)}
              disabled={pager.index === 0}
              className="btn btn-quiet btn-sm"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={() => setPager((p) => advance(p, nextCursor))}
              disabled={!hasMore}
              className="btn btn-quiet btn-sm"
            >
              Next <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
