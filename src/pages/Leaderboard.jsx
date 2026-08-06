import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Trophy, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const MEDAL = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 20;

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async () => {
    const { data } = await supabase
      .from("football_shots")
      .select("speed, force, football_players(id, name)");

    const byPlayer = new Map();

    for (const shot of data || []) {
      const player = shot.football_players;
      if (!player) continue;

      const entry = byPlayer.get(player.id) || {
        player: player.name,
        bestScore: 0,
        totalShots: 0,
      };

      entry.totalShots += 1;
      entry.bestScore = Math.max(entry.bestScore, (shot.speed || 0) + (shot.force || 0));

      byPlayer.set(player.id, entry);
    }

    setRows([...byPlayer.values()].sort((a, b) => b.bestScore - a.bestScore));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Every new shot potentially reshuffles the ranking, so re-aggregate on
  // any insert rather than trying to patch one row's score in place.
  useEffect(() => {
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "football_shots" }, load)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.player.toLowerCase().includes(q));
  }, [rows, search]);

  const visible = filtered.slice(0, visibleCount);
  const topScore = rows[0]?.bestScore || 1;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">Player Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Ranked by best combined speed + force score.</p>
      </div>

      {rows.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Search players…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40 sm:max-w-xs"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Trophy className="h-6 w-6" />
          No shots recorded yet — run a Session with a player selected.
        </div>
      )}

      {!loading && rows.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Search className="h-6 w-6" />
          No player matches "{search}".
        </div>
      )}

      <div className="space-y-2">
        {visible.map((item, i) => {
          const rank = filtered.indexOf(item); // stable rank even while filtered
          return (
            <motion.div
              key={item.player + i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className={`flex items-center gap-4 rounded-xl border p-4
                ${rank === 0 && !search ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
            >
              <span className="w-8 text-center text-lg">{!search && MEDAL[rank] ? MEDAL[rank] : `#${rows.indexOf(item) + 1}`}</span>

              <span className="flex-1 font-medium">{item.player}</span>

              <div className="hidden w-40 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(item.bestScore / topScore) * 100}%` }}
                  />
                </div>
              </div>

              <span className="font-data w-20 text-right text-sm font-semibold">{item.bestScore.toFixed(1)}</span>
              <span className="w-20 text-right text-xs text-muted-foreground">{item.totalShots} shots</span>
            </motion.div>
          );
        })}
      </div>

      {filtered.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60"
          >
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
