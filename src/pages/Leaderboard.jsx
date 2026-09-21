import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Trophy, Search, Zap } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { fetchLeaderboard, LEADERBOARD_LIMIT } from "../lib/analyticsQueries";
import PageHeader from "../components/common/PageHeader";
import StateBlock from "../components/common/StateBlock";

const MEDAL = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 20;
// A burst of kicks used to mean a full re-aggregation per kick.
const REALTIME_COALESCE_MS = 2000;

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasAnyShots, setHasAnyShots] = useState(false);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState("");

  // Read by the realtime handler so a refresh uses the current search
  // without re-subscribing the channel on every keystroke.
  const searchRef = useRef("");
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // Ranking and aggregation now happen in Postgres (football_leaderboard).
  // This used to select every shot row in the table and group them in the
  // browser -- which past PostgREST's 1000-row cap silently ranked players on
  // a slice of their shots rather than all of them.
  const load = useCallback(async (term = "") => {
    const { data, error: loadError, capped: hitLimit } = await fetchLeaderboard({ search: term });

    if (loadError) {
      setError("Couldn't load the leaderboard — check your connection and try again.");
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((r) => ({
      player: r.player_name,
      bestScore: Number(r.best_score) || 0,
      totalShots: Number(r.total_shots) || 0,
    }));

    setError("");
    setRows(mapped);
    setCapped(hitLimit);
    if (!term.trim()) setHasAnyShots(mapped.length > 0);
    else if (mapped.length) setHasAnyShots(true);
    setLoading(false);
  }, []);

  // Search is a database match, so it covers every player -- not just the
  // ones already on screen.
  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  useEffect(() => {
    let pending = null;

    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "football_shots" }, () => {
        // A new shot can reshuffle the ranking, but a rally of kicks should
        // cost one refresh, not one per kick.
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          load(searchRef.current);
        }, REALTIME_COALESCE_MS);
      })
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = rows; // filtering happens in the query now
  const visible = filtered.slice(0, visibleCount);
  const topScore = rows[0]?.bestScore || 1;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Overview"
        title="Leaderboard"
        description="Every player's best single strike, ranked."
      />

      {rows.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="leaderboard-search" className="sr-only">Search players</label>
          <input
            id="leaderboard-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Search players…"
            className="field !pl-9 sm:max-w-xs"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      {capped && (
        <p className="text-xs text-muted-foreground">
          Showing the top {LEADERBOARD_LIMIT} players by best score.
        </p>
      )}

      {/* The score mixes a full-scale index with a value in g, so it orders
          players without being a quantity in its own right. Saying so once, in
          the place someone reads the number, is the point -- the page
          description used to say it too, which cost a phone screen of space
          before any ranking appeared. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Strike score is a ranking figure, not a measurement: the speed index and impact of one kick,
        combined.
      </p>

      {loading && <StateBlock variant="loading" />}

      {!loading && !hasAnyShots && (
        <StateBlock
          icon={Trophy}
          title="Nothing ranked yet"
          message="Run a session with a player selected and their best strike appears here."
          action={
            <Link to="/session" className="btn btn-primary btn-sm">
              <Zap aria-hidden="true" className="h-4 w-4" /> Start a session
            </Link>
          }
        />
      )}

      {!loading && hasAnyShots && filtered.length === 0 && (
        <StateBlock icon={Search} title="No match" message={`No player matches "${search}".`} />
      )}

      <ul className="space-y-2">
        {visible.map((item, i) => {
          const rank = filtered.indexOf(item); // stable rank even while filtered
          return (
            <motion.li
              key={item.player + i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className={`flex items-center gap-4 rounded-xl border p-4
                ${rank === 0 && !search ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
            >
              <span className="font-data w-8 shrink-0 text-center text-lg">{!search && MEDAL[rank] ? MEDAL[rank] : `#${rows.indexOf(item) + 1}`}</span>

              <span className="min-w-0 flex-1 truncate font-medium">{item.player}</span>

              <div className="hidden w-40 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(item.bestScore / topScore) * 100}%` }}
                  />
                </div>
              </div>

              <span className="font-data w-20 text-right text-sm font-semibold tabular-nums">{item.bestScore.toFixed(1)}</span>
              <span className="hidden w-20 text-right text-xs text-muted-foreground sm:block">{item.totalShots} shots</span>
            </motion.li>
          );
        })}
      </ul>

      {filtered.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="btn btn-quiet btn-sm"
          >
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
