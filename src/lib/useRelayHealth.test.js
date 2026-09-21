import { describe, it, expect } from "vitest";
import { relayStatusFrom, RELAY_READY } from "./useRelayHealth";

// This mapping decides what the session screen tells someone to go and fix.
// Getting it wrong sends a person out to check a ball when the problem is on
// the server, so each branch is pinned rather than assumed.
describe("relayStatusFrom", () => {
  it("is ready only when the relay said it was", () => {
    expect(relayStatusFrom({ ok: true })).toBe(RELAY_READY);
  });

  it("keeps 'up but cannot reach its database' separate from 'not answering'", () => {
    // Same symptom for the user - no kicks recorded - but the fix is on the
    // server, not on the ball.
    expect(relayStatusFrom({ ok: false, reason: "degraded" })).toBe("degraded");
    expect(relayStatusFrom({ ok: false, reason: "unreachable" })).toBe("unreachable");
  });

  it("keeps a missing configuration distinct from a failure", () => {
    expect(relayStatusFrom({ ok: false, reason: "misconfigured" })).toBe("misconfigured");
  });

  it("treats an unhealthy or unrecognised answer as not answering", () => {
    expect(relayStatusFrom({ ok: false, reason: "unhealthy" })).toBe("unreachable");
    expect(relayStatusFrom({ ok: false, reason: "something-new" })).toBe("unreachable");
    expect(relayStatusFrom({ ok: false })).toBe("unreachable");
  });

  it("never reports ready when it was told nothing at all", () => {
    // A thrown-away probe must not be able to green-light a session.
    expect(relayStatusFrom()).toBe("unreachable");
    expect(relayStatusFrom({})).toBe("unreachable");
  });
});
