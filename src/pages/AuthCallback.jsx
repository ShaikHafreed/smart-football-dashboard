import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const STUCK_AFTER_MS = 10000;

/**
 * Lands here after an OAuth redirect (e.g. Google). There's no separate
 * "signup" step for OAuth, so we infer whether onboarding is finished
 * from the profile itself rather than needing a new DB flag.
 */
export default function AuthCallback() {
  const { session, profile, profileError, isLoadingAuth, signOut } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoadingAuth) return;

    if (profile) {
      const onboardingDone = !!profile.full_name && !!profile.dob;
      navigate(onboardingDone ? "/dashboard" : "/onboarding/name", { replace: true });
    }
    // If profileError is set, or profile stays null with no error (an edge
    // case we haven't seen but shouldn't spin forever on either), the
    // STUCK_AFTER_MS timeout below is what breaks out of this screen.
  }, [isLoadingAuth, profile, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const failed = profileError || (timedOut && !profile);

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-medium text-foreground">Sign-in didn't finish</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {session
            ? "You're signed in, but we couldn't load your profile. This is usually temporary."
            : "Something interrupted the sign-in redirect."}
        </p>
        {profileError?.message && (
          <p className="max-w-sm text-xs text-muted-foreground/70">Technical details: {profileError.message}</p>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => window.location.assign("/login")}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            Back to login
          </button>
          {session && (
            <button
              type="button"
              onClick={() => signOut().then(() => window.location.assign("/login"))}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Sign out & retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
    </div>
  );
}
