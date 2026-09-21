import { supabase } from "./supabaseClient";

// Base URL for the Flask hardware relay. Defaults to localhost for plain
// local dev; set VITE_FLASK_URL once the relay is deployed publicly (see
// backend/render.yaml) so the ESP32 and this site can both reach it from
// any Wi-Fi network, not just the one the relay's machine is on.
export const FLASK_URL = import.meta.env.VITE_FLASK_URL || "http://127.0.0.1:5000";

/**
 * fetch() wrapper for Flask routes that require a logged-in user
 * (anything decorated with @require_user_auth on the backend).
 *
 * Always reads the session via supabase.auth.getSession() right before
 * the call rather than caching a token: the Supabase client refreshes the
 * access token in the background on its own schedule, so this guarantees
 * the request carries whatever token is currently valid instead of one
 * that may have expired since the user's last render.
 */
/**
 * Fails loudly on a backend URL that would send a Supabase access token over
 * plain HTTP from an HTTPS page. The browser blocks that as mixed content
 * anyway, but the default FLASK_URL is a localhost http:// address -- so a
 * deployment that forgets VITE_FLASK_URL would otherwise look like a
 * mysterious network error on every device and session action, rather than
 * the configuration mistake it is.
 */
function assertSecureBackendUrl() {
  if (typeof window === "undefined") return;
  if (window.location.protocol !== "https:") return;
  if (FLASK_URL.startsWith("https://")) return;

  throw new Error(
    "This site is configured without a backend URL (VITE_FLASK_URL), so device " +
    "and session actions can't reach the relay. An access token must never be " +
    "sent over plain HTTP."
  );
}

export async function authedFetch(path, options = {}) {
  assertSecureBackendUrl();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not logged in");
  }

  const resp = await fetch(`${FLASK_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  // A 401 here means Supabase itself considers the session invalid (not
  // just stale) -- refreshing again wouldn't help, so surface it as a
  // sign-out condition for the caller to handle rather than retrying.
  if (resp.status === 401) {
    throw new Error("Session expired — please log in again.");
  }

  return resp;
}

/**
 * Is the relay itself reachable, independent of whether the ball is sending
 * anything?
 *
 * These are two different facts and the dashboard used to show only their
 * combination, so "no readings" looked identical whether the ball was switched
 * off or the relay was down. On the free hosting tier the relay also sleeps
 * when idle and takes the better part of a minute to wake, during which a
 * perfectly healthy system reports nothing at all.
 *
 * /healthz is public and unauthenticated by design, so this needs no session
 * and tells us nothing privileged - only whether the thing that accepts
 * readings is currently answering.
 */
export async function checkRelayHealth({ timeoutMs = 60000 } = {}) {
  try {
    assertSecureBackendUrl();
  } catch (error) {
    return { ok: false, reason: "misconfigured", message: error.message };
  }

  // A sleeping free-tier instance can take most of a minute to answer, which
  // is a wait worth allowing rather than reporting as "down".
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const resp = await fetch(`${FLASK_URL}/healthz`, { signal: abort.signal });
    if (!resp.ok) return { ok: false, reason: "unhealthy" };

    // The relay answers 200 while it is running, and says in the body whether
    // it can actually reach the database it needs to verify anyone. Reading
    // only the status would report a relay that cannot authenticate a single
    // request as healthy -- which is precisely how a bad SUPABASE_URL stayed
    // invisible in production.
    const body = await resp.json().catch(() => null);
    if (body?.status === "degraded") {
      return { ok: false, reason: "degraded", dependency: body?.dependencies?.supabase };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
