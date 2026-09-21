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
import PageHeader from "../components/common/PageHeader";
import StateBlock from "../components/common/StateBlock";

const PAGE_SIZE = HISTORY_PAGE_SIZE;
const REALTIME_COALESCE_MS = 2000;

export default function History() {
  const [data, setData] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Paging is a stack of cursors rather than an offset: cursors[n] is the row
  // page n resumes after, and cursors[0] is null because page 1 starts at the
  // top. Going back is popping the stack, so "previous" costs the same as
  // "next" and neither one re-walks the rows before it.
  const [cursors, setCursors] = useState([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // Arrives on its own; the rows never wait for it.
  const [totalCount, setTotalCount] = useState(null);

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

  const cursor = cursors[pageIndex] ?? null;

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
    setCursors([null]);
    setPageIndex(0);
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
    if (pageIndex !== 0 || playerFilter || appliedSearch) return;

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
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [pageIndex, playerFilter, appliedSearch, filters, loadPage]);

  const goNext = () => {
    if (!nextCursor) return;
    setCursors((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((i) => i + 1);
  };

  const filtered = Boolean(appliedSearch || playerFilter || filters.since);
  const firstOnPage = pageIndex * PAGE_SIZE + 1;
  const lastOnPage = pageIndex * PAGE_SIZE + data.length;
  const showPager = pageIndex > 0 || hasMore;

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
          until then the rows are still fully usable. */}
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
          <span className="text-xs text-muted-foreground">Page {pageIndex + 1}</span>

          <div className="flex gap-2">
            <button
              onClick={() => setPageIndex(0)}
              disabled={pageIndex === 0}
              className="btn btn-quiet btn-sm"
            >
              <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Newest</span>
            </button>
            <button
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
              className="btn btn-quiet btn-sm"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={goNext}
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
