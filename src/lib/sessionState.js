/**
 * The live session's visual state machine.
 *
 * The screen has one job at any moment: say unmistakably what state the
 * session is in. That was previously spread across four booleans read
 * inline in the markup (`running`, `starting`, `summary`, `ready`), which is
 * how a screen ends up able to render two states at once — "stopped" beside a
 * completion summary, or a live pulse while the relay is unreachable.
 *
 * Deriving one named state from those inputs makes the combinations explicit,
 * and makes them testable in a project whose test environment has no DOM.
 *
 * BLOCKED  something required is missing, so starting would record nothing
 * READY    all three conditions met, waiting on the person
 * ARMING   start requested, relay being told to bind the ball
 * LIVE     recording, nothing has landed recently
 * IMPACT   a kick landed just now; LIVE with the event still being shown
 * COMPLETE stopped, with an account of what the session produced
 */

export const SESSION_STATES = ["blocked", "ready", "arming", "live", "impact", "complete"];

/** How long a kick stays visually "just landed" before settling back to live. */
export const IMPACT_FLASH_MS = 900;

export function deriveSessionState({
  running = false,
  starting = false,
  summary = null,
  blockers = [],
  lastImpactAt = null,
  now = Date.now(),
} = {}) {
  // Order matters: these are checked most-specific first, because several are
  // true at once and only one can be shown.
  if (starting) return "arming";

  if (running) {
    const since = lastImpactAt == null ? Infinity : now - lastImpactAt;
    // A timestamp from the future is a clock skew, not a kick in the future.
    return since >= 0 && since < IMPACT_FLASH_MS ? "impact" : "live";
  }

  if (summary) return "complete";
  return blockers.length ? "blocked" : "ready";
}

/** What the state badge says, and how loudly it says it. */
export const SESSION_PRESENTATION = {
  blocked: { label: "Not ready", tone: "idle", live: false },
  ready: { label: "Ready to record", tone: "ready", live: false },
  arming: { label: "Starting session", tone: "pending", live: false },
  live: { label: "Recording", tone: "live", live: true },
  impact: { label: "Kick recorded", tone: "impact", live: true },
  complete: { label: "Session complete", tone: "done", live: false },
};

/**
 * Whether the timer should be counting. Kept here rather than read off
 * `running` at the call site so the state machine stays the single answer to
 * "what is happening"; ARMING deliberately does not tick, because the session
 * has not started until the relay has accepted it.
 */
export function isTiming(state) {
  return state === "live" || state === "impact";
}
