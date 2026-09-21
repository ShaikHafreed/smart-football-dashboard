import { describe, it, expect } from "vitest";
import {
  deriveSessionState,
  isTiming,
  SESSION_PRESENTATION,
  SESSION_STATES,
  IMPACT_FLASH_MS,
} from "./sessionState";

describe("deriveSessionState", () => {
  it("is blocked while anything required is missing", () => {
    expect(deriveSessionState({ blockers: ["no ball"] })).toBe("blocked");
    expect(deriveSessionState({ blockers: ["no ball", "relay down"] })).toBe("blocked");
  });

  it("is ready only when nothing is blocking", () => {
    expect(deriveSessionState({ blockers: [] })).toBe("ready");
    expect(deriveSessionState({})).toBe("ready");
  });

  it("shows arming while the relay is being told to bind the ball", () => {
    expect(deriveSessionState({ starting: true })).toBe("arming");
  });

  it("does not let a stale blocker override a session that is starting", () => {
    // The checks ran before Start; once it is under way, the screen must show
    // what is happening rather than what was missing a moment ago.
    expect(deriveSessionState({ starting: true, blockers: ["relay down"] })).toBe("arming");
  });

  it("is live while running with nothing landing", () => {
    expect(deriveSessionState({ running: true })).toBe("live");
    expect(deriveSessionState({ running: true, lastImpactAt: null })).toBe("live");
  });

  it("flashes impact for a kick that just landed, then settles", () => {
    const now = 10_000;
    expect(deriveSessionState({ running: true, lastImpactAt: now - 50, now })).toBe("impact");
    expect(deriveSessionState({ running: true, lastImpactAt: now - (IMPACT_FLASH_MS - 1), now })).toBe("impact");
    expect(deriveSessionState({ running: true, lastImpactAt: now - IMPACT_FLASH_MS, now })).toBe("live");
    expect(deriveSessionState({ running: true, lastImpactAt: now - 60_000, now })).toBe("live");
  });

  it("treats a future timestamp as clock skew, not a kick", () => {
    const now = 10_000;
    expect(deriveSessionState({ running: true, lastImpactAt: now + 5_000, now })).toBe("live");
  });

  it("is complete once stopped with something to report", () => {
    expect(deriveSessionState({ summary: { kicks: 3 } })).toBe("complete");
    // Even a session that recorded nothing is complete -- it has an account.
    expect(deriveSessionState({ summary: { kicks: 0 } })).toBe("complete");
  });

  it("never shows a completed session as live", () => {
    // The pair that used to be renderable at once.
    expect(deriveSessionState({ running: true, summary: { kicks: 3 } })).toBe("live");
    expect(deriveSessionState({ running: false, summary: { kicks: 3 } })).toBe("complete");
  });

  it("prefers the completion summary over re-reporting blockers", () => {
    expect(deriveSessionState({ summary: { kicks: 2 }, blockers: ["relay down"] })).toBe("complete");
  });

  it("only ever returns a state the presentation layer knows how to draw", () => {
    const inputs = [
      {}, { blockers: ["x"] }, { starting: true }, { running: true },
      { running: true, lastImpactAt: Date.now() }, { summary: {} },
    ];
    for (const input of inputs) {
      const state = deriveSessionState(input);
      expect(SESSION_STATES).toContain(state);
      expect(SESSION_PRESENTATION[state]).toBeDefined();
    }
  });
});

describe("isTiming", () => {
  it("runs the clock only while the session is actually recording", () => {
    expect(isTiming("live")).toBe(true);
    expect(isTiming("impact")).toBe(true);
  });

  it("does not tick before the relay has accepted the session", () => {
    // Counting during ARMING would report time the session did not record.
    expect(isTiming("arming")).toBe(false);
  });

  it("does not tick when there is no session", () => {
    expect(isTiming("ready")).toBe(false);
    expect(isTiming("blocked")).toBe(false);
    expect(isTiming("complete")).toBe(false);
  });
});

describe("SESSION_PRESENTATION", () => {
  it("marks live and impact as the only states that claim to be live", () => {
    const live = SESSION_STATES.filter((s) => SESSION_PRESENTATION[s].live);
    expect(live).toEqual(["live", "impact"]);
  });

  it("gives every state a distinct label, so two never read the same", () => {
    const labels = SESSION_STATES.map((s) => SESSION_PRESENTATION[s].label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
