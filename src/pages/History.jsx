import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Radar } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function History() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("football_shots")
      .select("id, speed, spin, force, distance, shot_type, created_at, football_players(name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setData(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">Shot History</h1>
        <p className="text-sm text-muted-foreground">Every recorded kick, most recent first.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          <Radar className="h-6 w-6" />
          No shots recorded yet — run a Session with a player selected.
        </div>
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
            <span className="font-medium">{item.football_players?.name || "Unknown"}</span>

            <div className="flex flex-wrap gap-4 font-data text-sm text-muted-foreground">
              <span><span className="text-foreground">{item.speed}</span> km/h</span>
              <span><span className="text-foreground">{item.spin}</span> rpm</span>
              <span><span className="text-foreground">{item.force}</span> N</span>
              <span><span className="text-foreground">{item.distance}</span> m</span>
            </div>

            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
