import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Square, RotateCcw, User } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

const FLASK = "http://127.0.0.1:5000";

export default function Session() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [activePlayer, setActivePlayer] = useState(null);
  const [error, setError] = useState("");
  const sessionIdRef = useRef(null);

  useEffect(() => {
    const id = localStorage.getItem("activePlayerId");
    if (!id) return;

    supabase
      .from("football_players")
      .select("id, name")
      .eq("id", id)
      .single()
      .then(({ data }) => setActivePlayer(data || null));
  }, []);

  useEffect(() => {
    let interval;

    if (running) {
      interval = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [running]);

  const formatTime = () => {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handleStart = async () => {
    if (!activePlayer || !user) {
      setError("Select a player on the Players page first.");
      return;
    }

    setError("");

    const { data, error: insertError } = await supabase
      .from("football_sessions")
      .insert({ user_id: user.id, player_id: activePlayer.id })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    sessionIdRef.current = data.id;

    try {
      await fetch(`${FLASK}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: data.id, player_id: activePlayer.id }),
      });
    } catch {
      // Hardware relay offline — the session row is still recorded in Supabase.
    }

    setRunning(true);
  };

  const handleStop = async () => {
    setRunning(false);

    if (sessionIdRef.current) {
      await supabase
        .from("football_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionIdRef.current);
    }

    try {
      await fetch(`${FLASK}/api/session/stop`, { method: "POST" });
    } catch {
      // Ignore — nothing to clean up client-side if the relay is offline.
    }

    sessionIdRef.current = null;
  };

  const handleReset = () => {
    setRunning(false);
    setTime(0);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 animate-fadeIn">

      <div>
        <h1 className="font-display text-2xl font-semibold">Session</h1>
        <p className="text-sm text-muted-foreground">Start a session to record shots for the active player.</p>
      </div>

      {/* ACTIVE PLAYER */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-4 w-4" />
        </div>
        {activePlayer ? (
          <p>Recording for <strong>{activePlayer.name}</strong></p>
        ) : (
          <p className="text-warn">No active player selected — go to Players and pick one.</p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      {/* STATUS + TIMER */}
      <div className={`turf-texture relative overflow-hidden rounded-2xl border p-10 text-center transition-colors
        ${running ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
        <div className="relative z-10">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium
            ${running ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
            {running ? "Session Running" : "Session Stopped"}
          </span>

          <p className="font-data mt-6 text-6xl font-semibold tracking-tight">{formatTime()}</p>
        </div>
      </div>

      {/* BUTTONS */}
      <div className="flex justify-center gap-4">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleStart}
          disabled={running}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Play className="h-4 w-4" /> Start
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleStop}
          disabled={!running}
          className="flex items-center gap-2 rounded-xl bg-destructive/15 px-6 py-3 text-sm font-semibold text-destructive disabled:opacity-40"
        >
          <Square className="h-4 w-4" /> Stop
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleReset}
          className="flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-medium text-muted-foreground"
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </motion.button>
      </div>
    </div>
  );
}
