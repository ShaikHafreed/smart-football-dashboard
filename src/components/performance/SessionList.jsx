import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, Trophy, Gauge, RotateCw, CalendarClock } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { summarizeSession } from "../../lib/performanceMetrics";

/**
 * Sessions (most recent first), each expandable to show its kicks and the
 * computed Best Kick / Max Speed Kick / spin-at-those-moments metrics.
 *
 * playerIds: uuid[] — sessions across all of these players are shown.
 * playerNames: optional { [id]: name } — shown on each session when set
 *   (coach view, multiple players); omitted for a single player's own view.
 */
export default function SessionList({ playerIds, playerNames }) {
  const [sessions, setSessions] = useState([]);
  const [shotsBySession, setShotsBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!playerIds || playerIds.length === 0) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data: sessionRows } = await supabase
        .from("football_sessions")
        .select("id, player_id, started_at, ended_at")
        .in("player_id", playerIds)
        .order("started_at", { ascending: false });

      const ids = (sessionRows || []).map((s) => s.id);

      const { data: shotRows } = ids.length
        ? await supabase
            .from("football_shots")
            .select("session_id, speed, spin, force, distance, shot_type, created_at")
            .in("session_id", ids)
        : { data: [] };

      const grouped = {};
      for (const shot of shotRows || []) {
        (grouped[shot.session_id] ||= []).push(shot);
      }

      setSessions(sessionRows || []);
      setShotsBySession(grouped);
      setLoading(false);
    };

    load();
  }, [playerIds?.join(",")]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No sessions recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const shots = shotsBySession[session.id] || [];
        const summary = summarizeSession(shots);
        const isOpen = openId === session.id;

        return (
          <div key={session.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <button
              onClick={() => setOpenId(isOpen ? null : session.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {new Date(session.started_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    {playerNames?.[session.player_id] && (
                      <span className="ml-2 text-muted-foreground">· {playerNames[session.player_id]}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{shots.length} kick{shots.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border p-4">
                    {shots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No kicks recorded in this session.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-secondary/30 p-3">
                            <Trophy className="h-3.5 w-3.5 text-primary" />
                            <p className="font-data mt-1.5 text-lg font-semibold">{summary.bestKickScore.toFixed(1)}</p>
                            <p className="text-[11px] text-muted-foreground">Best Kick score</p>
                          </div>
                          <div className="rounded-lg bg-secondary/30 p-3">
                            <Gauge className="h-3.5 w-3.5 text-primary" />
                            <p className="font-data mt-1.5 text-lg font-semibold">{summary.maxSpeedKick?.speed ?? "-"}</p>
                            <p className="text-[11px] text-muted-foreground">Max Speed (km/h)</p>
                          </div>
                          <div className="rounded-lg bg-secondary/30 p-3">
                            <RotateCw className="h-3.5 w-3.5 text-blue-400" />
                            <p className="font-data mt-1.5 text-lg font-semibold">{summary.spinAtBestKick}</p>
                            <p className="text-[11px] text-muted-foreground">Spin @ Best Kick</p>
                          </div>
                          <div className="rounded-lg bg-secondary/30 p-3">
                            <RotateCw className="h-3.5 w-3.5 text-amber-400" />
                            <p className="font-data mt-1.5 text-lg font-semibold">{summary.spinAtMaxSpeedKick}</p>
                            <p className="text-[11px] text-muted-foreground">Spin @ Max Speed</p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1">
                          {shots.map((s, i) => (
                            <div key={i} className="flex justify-between rounded-lg bg-secondary/20 px-3 py-1.5 text-xs text-muted-foreground">
                              <span>{s.speed} km/h · {s.spin} rpm · {s.force} N · {s.distance} m</span>
                              <span>{new Date(s.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
