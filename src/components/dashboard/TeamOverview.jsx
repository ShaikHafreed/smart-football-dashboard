import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import PlayerDetailModal from "../players/PlayerDetailModal";

/** Coach-only: aggregated performance across every player on the roster. */
export default function TeamOverview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailPlayer, setDetailPlayer] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: players } = await supabase
        .from("football_players")
        .select("id, name")
        .order("created_at", { ascending: true });

      const { data: shots } = await supabase
        .from("football_shots")
        .select("speed, force, created_at, player_id");

      const byPlayer = new Map((players || []).map((p) => [p.id, {
        id: p.id,
        name: p.name,
        bestScore: 0,
        totalShots: 0,
        lastShotAt: null,
      }]));

      for (const shot of shots || []) {
        const entry = byPlayer.get(shot.player_id);
        if (!entry) continue;

        entry.totalShots += 1;
        entry.bestScore = Math.max(entry.bestScore, (shot.speed || 0) + (shot.force || 0));
        if (!entry.lastShotAt || shot.created_at > entry.lastShotAt) entry.lastShotAt = shot.created_at;
      }

      setRows([...byPlayer.values()].sort((a, b) => b.bestScore - a.bestScore));
      setLoading(false);
    };

    load();
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Team Overview</h2>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} player{rows.length === 1 ? "" : "s"}</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Add players on the Players page to see their performance here.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <motion.button
              key={r.id}
              onClick={() => setDetailPlayer(r)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="rounded-xl border border-border bg-secondary/30 p-4 text-left transition-colors hover:border-primary/40"
            >
              <p className="font-medium">{r.name}</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-data text-2xl font-semibold text-primary">{r.bestScore.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">best score</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.totalShots} shot{r.totalShots === 1 ? "" : "s"}
                {r.lastShotAt && ` · last ${new Date(r.lastShotAt).toLocaleDateString()}`}
              </p>
            </motion.button>
          ))}
        </div>
      )}

      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
    </div>
  );
}
