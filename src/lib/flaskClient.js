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
export async function authedFetch(path, options = {}) {
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
