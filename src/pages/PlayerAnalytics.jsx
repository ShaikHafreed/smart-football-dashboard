import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, RotateCw, Zap, Ruler, ListChecks } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import SessionList from "../components/performance/SessionList";
import { classifyForce } from "../utils/sensorUtils";
import { fetchPlayerShotStats, fetchRecentShots, mergeShotStats } from "../lib/analyticsQueries";
import PageHeader from "../components/common/PageHeader";
import Panel from "../components/common/Panel";
import StateBlock from "../components/common/StateBlock";
import MeasurementLegend from "../components/common/MeasurementLegend";

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
    return <StateBlock variant="loading" title="Loading your performance…" />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Overview"
        title="My Performance"
        description={
          stats.shotCount
            ? `Personal bests across ${stats.shotCount.toLocaleString()} recorded kick${stats.shotCount === 1 ? "" : "s"}.`
            : "Personal bests, trends and drills, drawn from your own kicks."
        }
      />

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {stats.shotCount === 0 ? (
        <StateBlock
          icon={Gauge}
          title="No kicks recorded yet"
          message="Start a session with a paired ball and your bests, trend and drills will build up here."
          action={<Link to="/session" className="btn btn-primary btn-sm"><Zap aria-hidden="true" className="h-4 w-4" /> Start a session</Link>}
        />
      ) : (
        <>
          {/* PERSONAL BESTS */}
          <div className="hairline-grid grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Best speed index", value: bests.speed, unit: "", icon: Gauge },
              { label: "Best spin", value: bests.spin, unit: "rpm", icon: RotateCw },
              { label: "Best impact", value: bests.force, unit: "g", icon: Zap },
              { label: "Best carry index", value: bests.distance, unit: "", icon: Ruler },
            ].map(({ label, value, unit, icon: Icon }) => (
              <div key={label} className="p-5">
                <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <p className="font-data mt-3 text-3xl font-semibold leading-none tabular-nums">
                  {value}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>
                </p>
                <p className="mt-2 text-sm font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <MeasurementLegend />

          {/* TREND */}
          <PerformanceChart history={history} />

          {/* PRACTICE TASKS */}
          <Panel
            title="Suggested practice"
            icon={ListChecks}
            description={`Matched to your ${level} force output — check drills off as you complete them.`}
          >
            <div className="space-y-2">
              {drills.map((drill) => (
                <label
                  key={drill}
                  className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm transition-colors hover:border-primary/40"
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
          </Panel>

          {/* PERFORMANCE BY SESSION */}
          <div>
            <h2 className="font-display mb-3 text-sm font-semibold">Performance by session</h2>
            <SessionList playerIds={playerIds} />
          </div>
        </>
      )}
    </div>
  );
}
