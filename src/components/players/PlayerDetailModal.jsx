import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Gauge, RotateCw, Zap, Ruler, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import PerformanceChart from "../dashboard/PerformanceChart";

export default function PlayerDetailModal({ player, onClose }) {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player) return;
    setLoading(true);

    supabase
      .from("football_shots")
      .select("speed, spin, force, distance, shot_type, created_at")
      .eq("player_id", player.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setShots(data || []);
        setLoading(false);
      });
  }, [player]);

  const bests = shots.reduce(
    (acc, s) => ({
      speed: Math.max(acc.speed, s.speed || 0),
      spin: Math.max(acc.spin, s.spin || 0),
      force: Math.max(acc.force, s.force || 0),
      distance: Math.max(acc.distance, s.distance || 0),
    }),
    { speed: 0, spin: 0, force: 0, distance: 0 }
  );

  const history = shots.slice(-15).map((s) => ({
    time: new Date(s.created_at).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    kickForce: s.force,
    ballSpeed: s.speed,
    spinRate: s.spin,
  }));

  return (
    <AnimatePresence>
      {player && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-6 sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">{player.name}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : shots.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No shots recorded for this player yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Speed", value: bests.speed, unit: "km/h", icon: Gauge, color: "text-primary" },
                    { label: "Spin", value: bests.spin, unit: "rpm", icon: RotateCw, color: "text-blue-400" },
                    { label: "Force", value: bests.force, unit: "N", icon: Zap, color: "text-amber-400" },
                    { label: "Distance", value: bests.distance, unit: "m", icon: Ruler, color: "text-fuchsia-400" },
                  ].map(({ label, value, unit, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
                      <Icon className={`mx-auto h-4 w-4 ${color}`} />
                      <p className="font-data mt-1 text-lg font-semibold">{value}</p>
                      <p className="text-[11px] text-muted-foreground">{label} ({unit})</p>
                    </div>
                  ))}
                </div>

                <PerformanceChart history={history} />

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Recent shots</p>
                  {shots.slice(-8).reverse().map((s, i) => (
                    <div key={i} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-xs">
                      <span>{s.speed} km/h · {s.spin} rpm · {s.force} N</span>
                      <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
