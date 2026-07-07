import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { UserPlus, Trash2, CheckCircle2, Users, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PlayerDetailModal from "../components/players/PlayerDetailModal";
import ChartErrorBoundary from "../components/ChartErrorBoundary";

const PIE_COLORS = ["hsl(82,100%,64%)", "hsl(217,91%,60%)", "hsl(38,100%,64%)", "hsl(280,70%,65%)", "hsl(0,84%,65%)"];

export default function CoachDashboard() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
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

    const [{ data: sessionRows }, { data: shotRows }] = await Promise.all([
      ids.length
        ? supabase.from("football_sessions").select("id, player_id, started_at").in("player_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("football_shots").select("speed, spin, force, player_id, shot_type, created_at").in("player_id", ids)
        : Promise.resolve({ data: [] }),
    ]);

    setPlayers(playerRows || []);
    setSessions(sessionRows || []);
    setShots(shotRows || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  const addPlayer = async () => {
    if (!name.trim() || !user || adding) return;

    setAdding(true);
    setAddError("");

    const { error } = await supabase.from("football_players").insert({ name: name.trim(), user_id: user.id });

    setAdding(false);

    if (error) {
      console.error("Failed to add player:", error);
      setAddError(error.message);
      return;
    }

    setName("");
    await loadAll();
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

  // Roster performance rollup
  const roster = useMemo(() => {
    return players.map((p) => {
      const playerShots = shots.filter((s) => s.player_id === p.id);
      return {
        ...p,
        totalShots: playerShots.length,
        bestSpeed: Math.max(0, ...playerShots.map((s) => s.speed || 0)),
        sessionCount: sessions.filter((s) => s.player_id === p.id).length,
      };
    });
  }, [players, shots, sessions]);

  // Pie: session attendance per player
  const attendanceData = roster
    .filter((p) => p.sessionCount > 0)
    .map((p) => ({ name: p.name, value: p.sessionCount }));

  // Pie: shot-type distribution across the roster
  const shotTypeData = useMemo(() => {
    const counts = {};
    for (const s of shots) counts[s.shot_type || "kick"] = (counts[s.shot_type || "kick"] || 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [shots]);

  // Trend: team-wide average speed & spin per day
  const trendData = useMemo(() => {
    const byDay = {};
    for (const s of shots) {
      const day = new Date(s.created_at).toLocaleDateString();
      byDay[day] ||= { day, speedTotal: 0, spinTotal: 0, count: 0 };
      byDay[day].speedTotal += s.speed || 0;
      byDay[day].spinTotal += s.spin || 0;
      byDay[day].count += 1;
    }
    return Object.values(byDay)
      .map((d) => ({ day: d.day, avgSpeed: +(d.speedTotal / d.count).toFixed(1), avgSpin: +(d.spinTotal / d.count).toFixed(1) }))
      .slice(-14);
  }, [shots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">Coach Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your roster, and how the whole team is trending.</p>
      </div>

      {/* ROSTER */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Roster</h2>
          <span className="ml-auto text-xs text-muted-foreground">{players.length} player{players.length === 1 ? "" : "s"}</span>
        </div>

        <div className="mb-2 flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder="Add a player..."
            className="flex-1 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={addPlayer}
            disabled={adding || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
          </motion.button>
        </div>

        {addError && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{addError}</p>
        )}

        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">No players yet — add one above.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((p) => {
              const isActive = activePlayerId === p.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 transition-colors ${isActive ? "border-primary/60 bg-primary/10" : "border-border bg-secondary/20 hover:border-primary/30"}`}
                >
                  <div className="flex items-center justify-between">
                    <button onClick={() => setDetailPlayer(p)} className="text-left font-medium hover:text-primary">
                      {p.name}
                    </button>
                    <button onClick={() => deletePlayer(p.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.totalShots} shots · best {p.bestSpeed} km/h</p>
                  <button onClick={() => selectActive(p.id)} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {isActive ? "Active for next Session" : "Set active"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CHARTS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-sm font-semibold">Session Attendance</h2>
          <div className="mt-2 h-56">
            <ChartErrorBoundary>
              {attendanceData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No sessions recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false}>
                      {attendanceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartErrorBoundary>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-sm font-semibold">Shot Type Distribution</h2>
          <div className="mt-2 h-56">
            <ChartErrorBoundary>
              {shotTypeData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No shots recorded yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={shotTypeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false}>
                      {shotTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartErrorBoundary>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-sm font-semibold">Team Speed &amp; Spin Trend</h2>
        <div className="mt-2 h-64">
          <ChartErrorBoundary>
            {trendData.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Not enough data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(155,16%,18%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(155,10%,55%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(155,10%,55%)" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="avgSpeed" name="Avg Speed" stroke="hsl(82,100%,64%)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="avgSpin" name="Avg Spin" stroke="hsl(217,91%,60%)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartErrorBoundary>
        </div>
      </div>

      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} onUpdated={loadAll} />
    </div>
  );
}
