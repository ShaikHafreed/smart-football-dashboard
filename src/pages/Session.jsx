import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Square, RotateCcw, User, RadioTower, Check, AlertCircle, Gauge, Zap, RotateCw, Ruler } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import PageHeader from "../components/common/PageHeader";

const EMPTY_READING = { speed: 0, spin: 0, force: 0, distance: 0 };

export default function Session() {
  const { user, role, ensureSelfPlayer } = useAuth();
  const reduceMotion = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [activePlayer, setActivePlayer] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState(EMPTY_READING);
  const [kickCount, setKickCount] = useState(0);
  const sessionIdRef = useRef(null);
  const lastReadingAtRef = useRef(null);

  const activeDeviceId = localStorage.getItem("activeDeviceId") || "";

  useEffect(() => {
    if (!user) return;

    const resolveActivePlayer = async () => {
      let id = localStorage.getItem("activePlayerId");

      // Players don't have a roster page to pick from — track themselves.
      if (!id && role === "player") {
        id = await ensureSelfPlayer();
        if (id) localStorage.setItem("activePlayerId", id);
      }

      if (!id) return;

      const { data } = await supabase
        .from("football_players")
        .select("id, name")
        .eq("id", id)
        .single();

      setActivePlayer(data || null);
    };

    resolveActivePlayer();
  }, [user, role]);

  useEffect(() => {
    let interval;

    if (running) {
      interval = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [running]);

  // While a session is running, show the kicks as they land — the same
  // football_devices row the dashboard subscribes to, so this adds no new
  // data path, just puts the reading where the person recording is looking.
  useEffect(() => {
    if (!running || !activeDeviceId) return undefined;

    const applyRow = (row) => {
      if (!row?.last_reading_at) return;
      setReading({
        speed: row.last_speed ?? 0,
        spin: row.last_spin ?? 0,
        force: row.last_force ?? 0,
        distance: row.last_distance ?? 0,
      });
      if (row.last_reading_at !== lastReadingAtRef.current) {
        lastReadingAtRef.current = row.last_reading_at;
        setKickCount((n) => n + 1);
      }
    };

    const channel = supabase
      .channel(`session-live-${activeDeviceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "football_devices", filter: `id=eq.${activeDeviceId}` },
        (payload) => applyRow(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [running, activeDeviceId]);

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

    if (!activeDeviceId) {
      setError("Pair and select a ball on the Devices page first.");
      return;
    }

    setError("");
    setStarting(true);

    // Close anything still open on this ball first. The database now allows
    // only one open session per device (the invariant Phase 2's attribution
    // already assumed), and a tab closed without pressing Stop leaves one
    // behind -- so without this, the next Start would be rejected.
    await supabase
      .from("football_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("device_id", activeDeviceId)
      .is("ended_at", null);

    const { data, error: insertError } = await supabase
      .from("football_sessions")
      .insert({ user_id: user.id, player_id: activePlayer.id, device_id: activeDeviceId })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setStarting(false);
      return;
    }

    sessionIdRef.current = data.id;

    try {
      // Authenticated: the relay verifies this account actually owns the
      // ball and can access the player before it binds kicks to them.
      const resp = await authedFetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: data.id, player_id: activePlayer.id, device_id: activeDeviceId }),
      });

      if (!resp.ok) {
        // The session row exists, but the relay won't attribute kicks to
        // it — say so instead of silently recording nothing.
        const body = await resp.json().catch(() => ({}));
        setError(body.error || "The hardware relay rejected this session — kicks won't be recorded.");
      }
    } catch {
      // Hardware relay offline — the session row is still recorded in Supabase.
      setError("Couldn't reach the hardware relay — kicks may not be recorded for this session.");
    }

    setKickCount(0);
    setReading(EMPTY_READING);
    lastReadingAtRef.current = null;
    setStarting(false);
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
      await authedFetch("/api/session/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: activeDeviceId }),
      });
    } catch {
      // Ignore — nothing to clean up client-side if the relay is offline.
    }

    sessionIdRef.current = null;
  };

  const handleReset = () => {
    setRunning(false);
    setTime(0);
    setKickCount(0);
    setReading(EMPTY_READING);
  };

  const ready = !!activePlayer && !!activeDeviceId;

  const checklist = [
    {
      ok: !!activePlayer,
      label: activePlayer ? `Recording for ${activePlayer.name}` : "No player selected",
      hint: activePlayer ? null : (role === "coach" ? "Pick one on the Dashboard roster." : "Reload once your player record is created."),
      icon: User,
      to: role === "coach" ? "/dashboard" : null,
    },
    {
      ok: !!activeDeviceId,
      label: activeDeviceId ? "Ball paired and active" : "No active ball",
      hint: activeDeviceId ? null : "Pair one and set it active on Devices.",
      icon: RadioTower,
      to: "/devices",
    },
  ];

  return (
    <div className="animate-fadeIn space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Training"
        title="Session"
        description="While a session runs, every kick from the active ball is recorded against the selected player."
      />

      {/* READINESS — both conditions, stated plainly, before the timer */}
      <ul className="hairline-grid grid-cols-1 sm:grid-cols-2">
        {checklist.map(({ ok, label, hint, icon: Icon, to }) => (
          <li key={label} className="flex items-start gap-3 p-5">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                ${ok ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {ok ? <Check aria-hidden="true" className="h-4 w-4" /> : <Icon aria-hidden="true" className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              {hint && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {hint}{" "}
                  {to && <Link to={to} className="text-primary underline underline-offset-2">Go</Link>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* STATUS + TIMER */}
      <section
        aria-label="Session status"
        className={`turf-texture relative overflow-hidden rounded-2xl border p-8 text-center transition-colors sm:p-10
          ${running ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
      >
        <div className="relative z-10">
          <span className={`chip ${running ? "border-primary/40 bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${running ? "bg-primary" : "bg-muted-foreground"} ${running && !reduceMotion ? "animate-pulse" : ""}`} />
            {running ? "Session running" : "Session stopped"}
          </span>

          <p className="font-data mt-6 text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl" aria-live="off">
            {formatTime()}
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {running ? (
              <>
                <span className="font-data text-foreground">{kickCount}</span> kick{kickCount === 1 ? "" : "s"} recorded
              </>
            ) : (
              "Start when the player is ready"
            )}
          </p>
        </div>
      </section>

      {/* LIVE READING — only while recording, and only real values */}
      {running && (
        <div className="hairline-grid grid-cols-2 sm:grid-cols-4" aria-label="Latest reading">
          {[
            { icon: Gauge, label: "Speed index", value: reading.speed, unit: "" },
            { icon: RotateCw, label: "Spin", value: reading.spin, unit: "rpm" },
            { icon: Zap, label: "Impact", value: reading.force, unit: "g" },
            { icon: Ruler, label: "Carry index", value: reading.distance, unit: "" },
          ].map(({ icon: Icon, label, value, unit }) => (
            <div key={label} className="p-5">
              <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <p className="font-data mt-3 text-2xl font-semibold tabular-nums">
                {value}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* CONTROLS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {!running ? (
          <motion.button
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            onClick={handleStart}
            disabled={!ready || starting}
            className="btn btn-primary w-full sm:w-auto sm:min-w-[11rem]"
          >
            <Play aria-hidden="true" className="h-4 w-4" /> {starting ? "Starting…" : "Start session"}
          </motion.button>
        ) : (
          <motion.button
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            onClick={handleStop}
            className="btn btn-danger w-full sm:w-auto sm:min-w-[11rem]"
          >
            <Square aria-hidden="true" className="h-4 w-4" /> Stop session
          </motion.button>
        )}

        <button onClick={handleReset} className="btn btn-quiet w-full sm:w-auto">
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> Reset timer
        </button>
      </div>
    </div>
  );
}
