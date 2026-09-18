import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Radar, Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { downloadCsv } from "../utils/csv";
import { fetchShotHistoryPage, HISTORY_PAGE_SIZE } from "../lib/analyticsQueries";
import PageHeader from "../components/common/PageHeader";
import StateBlock from "../components/common/StateBlock";

const PAGE_SIZE = HISTORY_PAGE_SIZE;
const REALTIME_COALESCE_MS = 2000;

export default function History() {
  const [data, setData] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [playerFilter, setPlayerFilter] = useState("");
  const [search, setSearch] = useState("");
  // The term actually sent to the database, a beat behind the input.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [error, setError] = useState("");

  // Search now runs in the database rather than over the rows already
  // fetched, so it covers the whole history and the pager's total count
  // stays consistent with what is being searched.
  const load = useCallback(async (pageIndex) => {
    setLoading(true);

    const { data: rows, error: loadError, count } = await fetchShotHistoryPage({
      page: pageIndex,
      pageSize: PAGE_SIZE,
      playerId: playerFilter,
      search: appliedSearch,
    });

    if (loadError) {
      setError("Couldn't load shot history — check your connection and try again.");
      setData([]);
      setTotalCount(0);
    } else {
      setError("");
      setData(rows);
      setTotalCount(count);
    }

    setLoading(false);
  }, [playerFilter, appliedSearch]);

  useEffect(() => {
    supabase.from("football_players").select("id, name").order("name").then(({ data }) => setPlayers(data || []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    load(page);
  }, [page, load]);

  // New shots appear at the top of page 0 automatically, without a
  // manual refresh — but only while looking at the first page + no active
  // player filter, so a live insert doesn't silently reshuffle a coach's
  // filtered/paged view out from under them.
  useEffect(() => {
    if (page !== 0 || playerFilter || appliedSearch) return;

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
            load(0);
          }, REALTIME_COALESCE_MS);
        }
      )
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [page, playerFilter, appliedSearch, load]);

  const visible = data; // the query already applied the filters

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Training"
        title="Shot History"
        description={totalCount ? `${totalCount.toLocaleString()} recorded kick${totalCount === 1 ? "" : "s"}, most recent first.` : "Every recorded kick, most recent first."}
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
          onChange={(e) => { setPlayerFilter(e.target.value); setPage(0); }}
          className="field sm:w-56"
        >
          <option value="">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading && <StateBlock variant="loading" />}

      {error && <StateBlock variant="error" icon={Radar} title="Couldn't load history" message={error} />}

      {!loading && !error && visible.length === 0 && (
        <StateBlock
          icon={Radar}
          title={appliedSearch || playerFilter ? "No matching shots" : "No shots recorded yet"}
          message={
            appliedSearch || playerFilter
              ? "Try a different player or clear the filters."
              : "Run a session with a player selected and every kick lands here."
          }
        />
      )}

      <div className="space-y-2">
        {visible.map((item, i) => (
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

      {/* PAGINATION */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {totalCount} total shots
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-quiet btn-sm"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn btn-quiet btn-sm"
            >
              Next <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
