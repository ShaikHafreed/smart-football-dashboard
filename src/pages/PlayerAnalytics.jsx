import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Gauge, RotateCw, Zap, Ruler, ListChecks, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import SessionList from "../components/performance/SessionList";
import { classifyForce } from "../utils/sensorUtils";
import { fetchPlayerShotStats, fetchRecentShots, mergeShotStats } from "../lib/analyticsQueries";

const DRILL_LIBRARY = {
  low: [
    "10x driven passes focusing on locking the ankle at contact",
    "Wall-rebound touches — 2 minutes, both feet",
    "Plant-foot positioning drill: 3 sets of 8 kicks",
  ],
  medium: [
    "Power-shot ladder: 5 kicks at increasing run-up distance",
    "Single-leg balance + shot, 3 sets of 6",
    "Target passing at 15m, 10 reps each foot",
  ],
  high: [
    "Long-range strikes — 8 reps, focus on follow-through",
    "Rapid-fire finishing drill: 12 shots in 60 seconds",
    "Curved free-kick practice, 6 attempts",
  ],
};

export default function PlayerAnalytics() {
  const { user, ensureSelfPlayer } = useAuth();
  const [recentShots, setRecentShots] = useState([]);
  const [stats, setStats] = useState({ speed: 0, spin: 0, force: 0, distance: 0, shotCount: 0 });
  const [playerIds, setPlayerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("practiceChecklist") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      await ensureSelfPlayer();

      const { data: players } = await supabase
        .from("football_players")
        .select("id")
        .eq("user_id", user.id);

      const ids = (players || []).map((p) => p.id);
      setPlayerIds(ids);

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      // Bests are computed in Postgres over EVERY shot; the chart pulls only
      // the most recent handful. This page used to download the player's
      // entire shot history ordered oldest-first and reduce it in the
      // browser -- so once they passed PostgREST's 1000-row cap, their
      // "personal best" was silently taken from their oldest thousand kicks
      // and stopped improving no matter how hard they hit the ball.
      const [statsResult, recentResult] = await Promise.all([
        fetchPlayerShotStats(ids),
        fetchRecentShots(ids),
      ]);

      if (statsResult.error || recentResult.error) {
        setError("Couldn't load your performance data — check your connection and try again.");
        setLoading(false);
        return;
      }

      setError("");
      setStats(mergeShotStats(statsResult.data));
      setRecentShots(recentResult.data);
      setLoading(false);
    };

    load();
  }, [user]);

  const bests = stats;

  const history = useMemo(
    () =>
      recentShots.map((s) => ({
        time: new Date(s.created_at).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        kickForce: s.force,
        ballSpeed: s.speed,
        spinRate: s.spin,
      })),
    [recentShots]
  );

  const level = classifyForce(bests.force);
  const drills = DRILL_LIBRARY[level];

  const toggleDrill = (drill) => {
    const next = { ...checked, [drill]: !checked[drill] };
    setChecked(next);
    localStorage.setItem("practiceChecklist", JSON.stringify(next));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your performance…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">My Performance</h1>
        <p className="text-sm text-muted-foreground">Personal bests, trends, and drills tailored to your data.</p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      {stats.shotCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No shots recorded yet — head to Session and start recording to see your stats here.
        </div>
      ) : (
        <>
          {/* PERSONAL BESTS */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Best Speed", value: bests.speed, unit: "km/h", icon: Gauge, color: "text-primary" },
              { label: "Best Spin", value: bests.spin, unit: "rpm", icon: RotateCw, color: "text-blue-400" },
              { label: "Best Force", value: bests.force, unit: "N", icon: Zap, color: "text-amber-400" },
              { label: "Best Distance", value: bests.distance, unit: "m", icon: Ruler, color: "text-fuchsia-400" },
            ].map(({ label, value, unit, icon: Icon, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="font-data mt-3 text-2xl font-semibold">{value}<span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </motion.div>
            ))}
          </div>

          {/* TREND */}
          <PerformanceChart history={history} />

          {/* PRACTICE TASKS */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-1 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-semibold">Suggested Practice</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground capitalize">
              Based on your {level} force output — check off drills as you complete them.
            </p>

            <div className="space-y-2">
              {drills.map((drill) => (
                <label
                  key={drill}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!checked[drill]}
                    onChange={() => toggleDrill(drill)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className={checked[drill] ? "text-muted-foreground line-through" : ""}>{drill}</span>
                </label>
              ))}
            </div>
          </div>

          {/* PERFORMANCE BY SESSION */}
          <div>
            <h2 className="font-display mb-3 text-sm font-semibold">Performance by Session</h2>
            <SessionList playerIds={playerIds} />
          </div>
        </>
      )}
    </div>
  );
}
