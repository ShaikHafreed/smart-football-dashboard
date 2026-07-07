import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Trophy } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("football_shots")
      .select("speed, force, football_players(id, name)")
      .then(({ data }) => {
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
      });
  }, []);

  const topScore = rows[0]?.bestScore || 1;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">Player Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Ranked by best combined speed + force score.</p>
      </div>

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

      <div className="space-y-2">
        {rows.map((item, i) => (
          <motion.div
            key={item.player + i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className={`flex items-center gap-4 rounded-xl border p-4
              ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
          >
            <span className="w-8 text-center text-lg">{MEDAL[i] || `#${i + 1}`}</span>

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
        ))}
      </div>
    </div>
  );
}
