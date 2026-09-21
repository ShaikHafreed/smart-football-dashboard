import { useEffect, useState } from "react";
import { checkRelayHealth } from "./flaskClient";

/**
 * Is the relay ready to record kicks?
 *
 * Two screens need this and they need it to agree: the dashboard, to explain
 * why nothing is arriving, and the session screen, to refuse to start a
 * session that would record nothing. Left inline in one of them, the other
 * would either duplicate the probe or quietly disagree with it.
 *
 * States are the ones a person can act on differently:
 *   checking      - asked, no answer yet
 *   waiting       - still no answer after a few seconds; the relay sleeps when
 *                   idle and can take most of a minute to wake
 *   ok            - answering, and it can reach the database behind it
 *   degraded      - answering, but it cannot reach its database, so it can
 *                   verify nobody and record nothing (a server-side fix)
 *   unreachable   - not answering at all
 *   misconfigured - this deployment has no relay URL to call
 */
export const RELAY_READY = "ok";

/**
 * A checkRelayHealth() result mapped to the state a person can act on.
 * Pure, so the mapping can be tested without a DOM -- and the mapping is the
 * part worth testing: collapsing "up but blind" into "unreachable" would send
 * someone to check the ball when the fix is on the server.
 */
export function relayStatusFrom({ ok, reason } = {}) {
  if (ok) return RELAY_READY;
  return ["misconfigured", "degraded"].includes(reason) ? reason : "unreachable";
}

/** How long before "checking" becomes "still waiting". */
const SLOW_AFTER_MS = 5000;

export function useRelayHealth() {
  const [status, setStatus] = useState("checking");
  const [probe, setProbe] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => {
      if (!cancelled) setStatus("waiting");
    }, SLOW_AFTER_MS);

    checkRelayHealth().then((result) => {
      clearTimeout(slow);
      if (!cancelled) setStatus(relayStatusFrom(result));
    });

    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
  }, [probe]);

  return {
    status,
    ready: status === RELAY_READY,
    checking: status === "checking" || status === "waiting",
    recheck: () => {
      setStatus("checking");
      setProbe((n) => n + 1);
    },
  };
}
