import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Square, RotateCcw, User, RadioTower, Check, AlertCircle, Gauge, Zap, RotateCw, Ruler, Server, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import { useRelayHealth } from "../lib/useRelayHealth";
import { formatClock, formatDuration } from "../utils/time";
import PageHeader from "../components/common/PageHeader";
import MeasurementLegend from "../components/common/MeasurementLegend";

const EMPTY_READING = { speed: 0, spin: 0, force: 0, distance: 0 };

const RELAY_LABEL = {
  checking: "Checking the relay",
  waiting: "Still waiting on the relay",
  ok: "Relay ready to record",
  degraded: "Relay can't reach the database",
  unreachable: "Relay not answering",
  misconfigured: "No relay configured",
};

const RELAY_HINT = {
  checking: "Making sure kicks will have somewhere to land.",
  waiting: "It sleeps when idle and can take up to a minute to wake. Starting now would record nothing.",
  degraded: "It's answering but can't reach the database, so kicks can't be saved. This needs fixing on the server.",
  unreachable: "Nothing is listening for kicks, so a session would record nothing.",
  misconfigured: "This deployment has no relay URL set, so kicks have nowhere to go.",
};

// Mirrors IMPACT_WINDOW_MS in firmware/smart_football/calibration.h.
const IMPACT_WINDOW_MS = 120;

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
  // What the session produced, kept after it stops so the screen can say what
  // just happened instead of resetting to a blank timer.
  const [summary, setSummary] = useState(null);
  const sessionIdRef = useRef(null);
  const lastReadingAtRef = useRef(null);
  const bestRef = useRef({ force: 0, spin: 0, speed: 0 });

  // The relay is the thing that actually records kicks. A session started
  // while it cannot is a session that runs a timer and saves nothing, which
  // is exactly what a broken deployment looked like from this screen.
  const relay = useRelayHealth();

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
        // Bests come from the readings that actually arrived, so the summary
        // reports the session rather than querying for it.
        bestRef.current = {
          force: Math.max(bestRef.current.force, Number(row.last_force) || 0),
          spin: Math.max(bestRef.current.spin, Number(row.last_spin) || 0),
          speed: Math.max(bestRef.current.speed, Number(row.last_speed) || 0),
        };
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

  const formatTime = () => formatClock(time);

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
    bestRef.current = { force: 0, spin: 0, speed: 0 };
    setSummary(null);
    setTime(0);
    setStarting(false);
    setRunning(true);
  };

  const handleStop = async () => {
    setRunning(false);
    // Recorded before the awaits, so a slow or failing network cannot cost
    // the person the account of the session they just ran.
    setSummary({ seconds: time, kicks: kickCount, best: bestRef.current, player: activePlayer?.name || null });

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

  // Reset used to just blank the screen while a session was running, which
  // left the row open in the database and the ball still bound to it on the
  // relay -- so kicks kept being attributed to a session the person believed
  // they had ended. It now only clears a finished session's numbers; ending a
  // running one is Stop's job, and Stop is what the button offers instead.
  const handleReset = () => {
    setTime(0);
    setKickCount(0);
    setReading(EMPTY_READING);
    setSummary(null);
    bestRef.current = { force: 0, spin: 0, speed: 0 };
  };

  const ready = !!activePlayer && !!activeDeviceId && relay.ready;

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
    {
      // Third condition, because a session is only real if something is
      // listening. The first two can both be green while every kick is
      // discarded.
      ok: relay.ready,
      pending: relay.checking,
      label: RELAY_LABEL[relay.status] || RELAY_LABEL.unreachable,
      hint: relay.ready ? null : RELAY_HINT[relay.status] || RELAY_HINT.unreachable,
      icon: Server,
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
      <ul aria-live="polite" className="hairline-grid grid-cols-1 sm:grid-cols-3">
        {checklist.map(({ ok, pending, label, hint, icon: Icon, to }) => (
          <li key={label} className="flex items-start gap-3 p-5">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                ${ok ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {ok ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : pending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Icon aria-hidden="true" className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              {hint && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {hint}{" "}
                  {to && <Link to={to} className="text-primary underline underline-offset-2">Go</Link>}
                  {Icon === Server && !relay.checking && (
                    <button onClick={relay.recheck} className="text-primary underline underline-offset-2">
                      Check again
                    </button>
                  )}
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

      {running && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each figure is the peak across the {IMPACT_WINDOW_MS} ms window the ball samples around
            contact, not a single instant.
          </p>
          <MeasurementLegend />
        </>
      )}

      {/* SESSION COMPLETE — the arc used to end by blanking the timer, so the
          person who just ran a session had nothing telling them what it
          produced or where it went. Every figure here was recorded during the
          session; nothing is queried, inferred or filled in. */}
      {!running && summary && (
        <motion.section
          aria-label="Session summary"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/40 bg-primary/5 p-6 sm:p-8"
        >
          <p className="eyebrow">Session complete</p>
          <h2 className="font-display mt-1 text-lg font-semibold">
            {summary.kicks > 0
              ? `${summary.kicks} kick${summary.kicks === 1 ? "" : "s"} recorded${summary.player ? ` for ${summary.player}` : ""}`
              : "No kicks were recorded"}
          </h2>

          {summary.kicks > 0 ? (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Duration", value: formatDuration(summary.seconds), unit: "" },
                  { label: "Best impact", value: summary.best.force, unit: "g" },
                  { label: "Best spin", value: summary.best.spin, unit: "rpm" },
                  { label: "Best speed index", value: summary.best.speed, unit: "" },
                ].map(({ label, value, unit }) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-data mt-1 text-xl font-semibold tabular-nums">
                      {value}
                      {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
                    </dd>
                  </div>
                ))}
              </dl>

              <Link to="/history" className="btn btn-quiet btn-sm mt-6">
                See these kicks in history <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The session ran for {formatDuration(summary.seconds)} but the ball didn&rsquo;t report anything.
              Check that it&rsquo;s powered on and on the same network, then run another.
            </p>
          )}
        </motion.section>
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

        {!running && (time > 0 || summary) && (
          <button onClick={handleReset} className="btn btn-quiet w-full sm:w-auto">
            <RotateCcw aria-hidden="true" className="h-4 w-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
