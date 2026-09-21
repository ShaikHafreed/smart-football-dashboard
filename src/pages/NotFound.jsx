import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

/**
 * A real 404.
 *
 * The router used to answer every unknown URL with a silent redirect to "/",
 * which meant a signed-in coach who mistyped /analitics was dropped onto the
 * marketing page with no explanation and no way to tell a typo from a route
 * that had been removed. Saying what happened, and offering the way back that
 * suits whoever is asking, is strictly more useful than pretending the
 * request was for the home page.
 */
export default function NotFound() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const home = user ? { to: "/dashboard", label: "Go to dashboard" } : { to: "/", label: "Back to home" };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="animate-fadeIn w-full max-w-md text-center">
        <span className="flex justify-center" aria-hidden="true">
          <Compass className="h-8 w-8 text-muted-foreground" />
        </span>

        <p className="eyebrow pt-5">Error 404</p>

        <h1 className="font-display pt-2 text-2xl font-semibold tracking-tight">
          This page doesn&rsquo;t exist
        </h1>

        <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
          Nothing is served at{" "}
          <span className="font-data break-all text-foreground">{pathname}</span>. Check the address, or
          pick up where you left off.
        </p>

        <div className="flex flex-wrap justify-center gap-2 pt-7">
          <Link to={home.to} className="btn btn-primary">
            {home.label}
          </Link>
          {user && (
            <Link to="/history" className="btn btn-quiet">
              Shot history
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
