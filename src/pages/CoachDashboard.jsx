import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { UserPlus, Trash2, CheckCircle2, Users, Loader2, Zap } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PlayerDetailModal from "../components/players/PlayerDetailModal";
import ChartErrorBoundary from "../components/ChartErrorBoundary";
import PageHeader from "../components/common/PageHeader";
import Panel from "../components/common/Panel";
import StateBlock from "../components/common/StateBlock";
import {
  fetchPlayerShotStats,
  fetchPlayerSessionStats,
  fetchDailyTotals,
  fetchShotTypeTotals,
  indexByPlayer,
  toDailyAverages,
  TREND_DAYS,
} from "../lib/analyticsQueries";

const PIE_COLORS = ["hsl(82,100%,64%)", "hsl(217,91%,60%)", "hsl(38,100%,64%)", "hsl(280,70%,65%)", "hsl(0,84%,65%)"];

export default function CoachDashboard() {
  const { user, org } = useAuth();
  const [players, setPlayers] = useState([]);
  const [shotStats, setShotStats] = useState({});
  const [sessionStats, setSessionStats] = useState({});
  const [shotTypeData, setShotTypeData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [activePlayerId, setActivePlayerId] = useState(localStorage.getItem("activePlayerId") || null);
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const loadAll = async () => {
    const { data: playerRows } = await supabase
      .from("football_players")
      .select("*")
      .order("created_at", { ascending: true });

    const ids = (playerRows || []).map((p) => p.id);
    setPlayers(playerRows || []);

    // Four small aggregate reads instead of downloading every session and
    // every shot of every player on the roster and grouping them here. Past
    // PostgREST's 1000-row cap that download stopped being complete, so the
    // team averages and totals shown were quietly computed from a slice.
    const [shotStatsResult, sessionStatsResult, dailyResult, shotTypeResult] = await Promise.all([
      fetchPlayerShotStats(ids),
      fetchPlayerSessionStats(ids),
      fetchDailyTotals(ids, { days: TREND_DAYS }),
      fetchShotTypeTotals(ids),
    ]);

    const failed = [shotStatsResult, sessionStatsResult, dailyResult, shotTypeResult].find((r) => r.error);
    if (failed) {
      console.error("Failed to load coach analytics:", failed.error);
      setLoadError("Couldn't load team analytics — check your connection and try again.");
    } else {
      setLoadError("");
    }

    setShotStats(indexByPlayer(shotStatsResult.data));
    setSessionStats(indexByPlayer(sessionStatsResult.data));
    setTrendData(toDailyAverages(dailyResult.data).slice(-TREND_DAYS));
    setShotTypeData(
      (shotTypeResult.data || []).map((r) => ({ name: r.shot_type, value: Number(r.shot_count) || 0 }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  const addPlayer = async () => {
    if (adding) return;

    if (!name.trim()) {
      setAddError("Type a player name first.");
      return;
    }

    if (!user) {
      setAddError("You're not signed in — try reloading the page.");
      return;
    }

    setAdding(true);
    setAddError("");

    try {
      // Attaching org_id (when this coach belongs to one) is what makes a
      // new player show up for every coach in the org, not just the one
      // who added them — loadAll()'s select has no user_id filter, so it
      // already relies entirely on RLS ("own players" OR "org players")
      // to decide what comes back.
      const { error } = await supabase
        .from("football_players")
        .insert({ name: name.trim(), user_id: user.id, org_id: org?.id || null });

      if (error) throw error;

      setName("");
      await loadAll();
    } catch (err) {
      // Covers both a Postgres/RLS error object and a thrown network/CORS
      // failure (e.g. a blocked request) — either way this must not leave
      // the button stuck silently disabled with no explanation.
      console.error("Failed to add player:", err);
      setAddError(err?.message || "Couldn't add the player — check your connection and try again.");
    } finally {
      setAdding(false);
    }
  };

  const deletePlayer = async (id) => {
    await supabase.from("football_players").delete().eq("id", id);
    if (activePlayerId === id) {
      setActivePlayerId(null);
      localStorage.removeItem("activePlayerId");
    }
    loadAll();
  };

  const selectActive = (id) => {
    setActivePlayerId(id);
    localStorage.setItem("activePlayerId", id);
  };

  const playerName = (id) => players.find((p) => p.id === id)?.name || "Unknown";

  // Roster performance rollup, from the per-player aggregates.
  const roster = useMemo(() => {
    return players.map((p) => ({
      ...p,
      totalShots: Number(shotStats[p.id]?.shot_count) || 0,
      bestSpeed: Number(shotStats[p.id]?.best_speed) || 0,
      sessionCount: Number(sessionStats[p.id]?.session_count) || 0,
    }));
  }, [players, shotStats, sessionStats]);

  // Pie: session attendance per player
  const attendanceData = roster
    .filter((p) => p.sessionCount > 0)
    .map((p) => ({ name: p.name, value: p.sessionCount }));

  if (loading) {
    return <StateBlock variant="loading" title="Loading roster…" />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Overview"
        title="Coach Dashboard"
        description="Your roster, and how the whole squad is trending."
        actions={
          <Link to="/session" className="btn btn-primary">
            <Zap aria-hidden="true" className="h-4 w-4" /> Start a session
          </Link>
        }
      />

      {loadError && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {/* ROSTER */}
      <Panel
        title="Roster"
        icon={Users}
        actions={<span className="text-xs text-muted-foreground">{players.length} player{players.length === 1 ? "" : "s"}</span>}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="add-player" className="sr-only">Player name</label>
          <input
            id="add-player"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder="Add a player…"
            className="field flex-1"
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={addPlayer}
            disabled={adding}
            className="btn btn-primary"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add player
          </motion.button>
        </div>

        {addError && (
          <p role="alert" className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{addError}</p>
        )}

        {roster.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No players yet — add one above to start recording sessions for them.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((p) => {
              const isActive = activePlayerId === p.id;
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border p-4 transition-colors ${isActive ? "border-primary/60 bg-primary/10" : "border-border bg-secondary/20 hover:border-primary/40"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => setDetailPlayer(p)}
                      className="min-w-0 flex-1 text-left font-medium hover:text-primary"
                    >
                      <span className="block truncate">{p.name}</span>
                      <span className="font-data mt-1 block text-xs font-normal text-muted-foreground">
                        {p.totalShots} shot{p.totalShots === 1 ? "" : "s"} · best speed index {p.bestSpeed} · {p.sessionCount} session{p.sessionCount === 1 ? "" : "s"}
                      </span>
                    </button>
                    <button
                      onClick={() => deletePlayer(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => selectActive(p.id)}
                    aria-pressed={isActive}
                    className={`mt-3 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors
                      ${isActive ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                    {isActive ? "Active for next session" : "Set active"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* CHARTS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Session attendance" description="Sessions recorded per player.">
          <div className="h-56">
            <ChartErrorBoundary>
              {attendanceData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No sessions recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false}>
                      {attendanceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--foreground))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartErrorBoundary>
          </div>
        </Panel>

        <Panel title="Shot types" description="Distribution across the roster.">
          <div className="h-56">
            <ChartErrorBoundary>
              {shotTypeData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No shots recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={shotTypeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false}>
                      {shotTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--foreground))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartErrorBoundary>
          </div>
        </Panel>
      </div>

      <Panel title="Team speed &amp; spin" description="Daily averages across the roster.">
        <div className="h-64">
          <ChartErrorBoundary>
            {trendData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Not enough data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="avgSpeed" name="Avg Speed" stroke="hsl(82,100%,64%)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="avgSpin" name="Avg Spin" stroke="hsl(217,91%,60%)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartErrorBoundary>
        </div>
      </Panel>

      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} onUpdated={loadAll} />
    </div>
  );
}
