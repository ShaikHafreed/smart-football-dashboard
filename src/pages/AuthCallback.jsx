import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

/**
 * Lands here after an OAuth redirect (e.g. Google). There's no separate
 * "signup" step for OAuth, so we infer whether onboarding is finished
 * from the profile itself rather than needing a new DB flag.
 */
export default function AuthCallback() {
  const { profile, isLoadingAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoadingAuth || !profile) return;

    const onboardingDone = !!profile.full_name && !!profile.dob;
    navigate(onboardingDone ? "/dashboard" : "/onboarding/name", { replace: true });
  }, [isLoadingAuth, profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
    </div>
  );
}
