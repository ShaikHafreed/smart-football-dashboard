import { Suspense, useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { Menu, Zap } from "lucide-react";
import Sidebar from "./Sidebar";
import StateBlock from "../common/StateBlock";


export default function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // The session is the product's primary action, so the bar offers it from
  // anywhere -- except while already there, where it would be a link to the
  // page you are on.
  const onSession = location.pathname === "/session";

  return (
    <div className="flex h-screen bg-background text-foreground">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 backdrop-blur-md md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary/60 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* On a phone the brand sits in the header, since the rail that
              normally carries it is off-canvas. */}
          <Link to="/dashboard" className="flex items-center gap-2 md:hidden" aria-label="Dashboard">
            <span aria-hidden="true" className="text-lg leading-none">⚽</span>
            <span className="font-display text-sm font-semibold">Smart Football</span>
          </Link>

          {/* The page's own heading is the h1 below; repeating it here cost a
              line of vertical space on every screen and was worst on a phone,
              where the same words appeared twice before any content. The bar
              carries the thing you might want from any page instead. */}
          <div className="ml-auto flex items-center gap-2">
            {!onSession && (
              <Link to="/session" className="btn btn-primary btn-sm">
                <Zap aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Start a session</span>
                <span className="sm:hidden">Session</span>
              </Link>
            )}
          </div>
        </header>

        <main id="content" className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl space-y-6 pb-10 md:space-y-8">
            {/* Pages are code-split, so a first visit to a section can be
                waiting on its chunk. The wait belongs inside the shell: the
                rail and the header stay put and only the content area shows
                a state, instead of the whole screen blanking. */}
            <Suspense fallback={<StateBlock variant="loading" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
