import { useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";

// Every authenticated route, so the header never falls back to a generic
// label the way /devices and /organization used to.
const TITLES = {
  "/dashboard": "Dashboard",
  "/leaderboard": "Leaderboard",
  "/analytics": "My Performance",
  "/session": "Session",
  "/devices": "Devices",
  "/organization": "Organization",
  "/history": "Shot History",
  "/profile": "Profile",
};

export default function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = TITLES[location.pathname] || "Smart Football AI";

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
          </Link>

          <h2 className="font-display truncate text-base font-semibold md:text-lg">{title}</h2>
        </header>

        <main id="content" className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl space-y-6 pb-10 md:space-y-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
