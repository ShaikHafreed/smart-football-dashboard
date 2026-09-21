import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Trophy,
  LayoutDashboard,
  Zap,
  History as HistoryIcon,
  Settings,
  PanelLeftClose,
  PanelLeft,
  X,
  LogOut,
  LineChart,
  RadioTower,
  Building2,
} from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { prefetchRoute } from "../../lib/routes";
import ConfirmDialog from "../ConfirmDialog";

// Grouped so the rail reads as "where I am / what I'm doing / my setup"
// rather than one undifferentiated list of nine links.
const COACH_MENU = [
  {
    group: "Overview",
    items: [
      { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
    ],
  },
  {
    group: "Training",
    items: [
      { name: "Session", path: "/session", icon: Zap },
      { name: "History", path: "/history", icon: HistoryIcon },
    ],
  },
  {
    group: "Setup",
    items: [
      { name: "Devices", path: "/devices", icon: RadioTower },
      { name: "Organization", path: "/organization", icon: Building2 },
      { name: "Profile", path: "/profile", icon: Settings },
    ],
  },
];

const PLAYER_MENU = [
  {
    group: "Overview",
    items: [
      { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { name: "My Performance", path: "/analytics", icon: LineChart },
      { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
    ],
  },
  {
    group: "Training",
    items: [
      { name: "Session", path: "/session", icon: Zap },
      { name: "History", path: "/history", icon: HistoryIcon },
    ],
  },
  {
    group: "Setup",
    items: [
      { name: "Devices", path: "/devices", icon: RadioTower },
      { name: "Profile", path: "/profile", icon: Settings },
    ],
  },
];

function BrandMark({ collapsed }) {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden="true" className="text-xl leading-none">⚽</span>
      {!collapsed && (
        <span className="font-display text-[15px] font-semibold tracking-tight">Smart Football AI</span>
      )}
    </span>
  );
}

function NavItems({ collapsed, onNavigate, role }) {
  const menu = role === "coach" ? COACH_MENU : PLAYER_MENU;

  return (
    <nav aria-label="Sections" className="space-y-6">
      {menu.map(({ group, items }) => (
        <div key={group}>
          {!collapsed && <p className="eyebrow px-3 pb-2">{group}</p>}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onNavigate}
                    // Each section is its own chunk, so the intent to go
                    // there is the moment to fetch it: by the time the click
                    // or the Enter key lands, it is usually already in
                    // memory. Touch fires on the press, ahead of the tap.
                    onMouseEnter={() => prefetchRoute(item.path)}
                    onFocus={() => prefetchRoute(item.path)}
                    onTouchStart={() => prefetchRoute(item.path)}
                    title={collapsed ? item.name : undefined}
                    className={({ isActive }) =>
                      `group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors
                      ${collapsed ? "justify-center" : ""}
                      ${isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity
                            ${isActive ? "opacity-100" : "opacity-0"}`}
                        />
                        <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-primary" : ""}`} />
                        {!collapsed && <span>{item.name}</span>}
                        {collapsed && <span className="sr-only">{item.name}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { signOut, role, profile, user } = useAuth();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const reduceMotion = useReducedMotion();
  const drawerRef = useRef(null);

  // Escape closes the drawer, and focus moves into it when it opens —
  // previously it could only be dismissed by tapping the scrim, which a
  // keyboard user cannot do.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKeyDown);
    drawerRef.current?.querySelector("a, button")?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const identity = (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 p-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
        {(profile?.full_name || user?.email || "?").slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{profile?.full_name || user?.email}</span>
        <span className="block text-[11px] capitalize text-muted-foreground">{role}</span>
      </span>
    </div>
  );

  return (
    <>
      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        message="You'll need to log back in to see your dashboard, players and history."
        confirmLabel="Log out"
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />

      {/* Desktop rail */}
      <aside
        className={`hidden flex-col justify-between border-r border-border bg-card transition-[width] duration-200 md:flex
          ${collapsed ? "w-[76px]" : "w-64"}`}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className={`flex items-center px-4 py-5 ${collapsed ? "justify-center px-0" : ""}`}>
            <BrandMark collapsed={collapsed} />
          </div>

          <div className="px-3 pb-4">
            <NavItems collapsed={collapsed} role={role} />
          </div>
        </div>

        <div className="space-y-3 border-t border-border p-3">
          {!collapsed && identity}

          <div className={`flex gap-2 ${collapsed ? "flex-col" : ""}`}>
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="btn btn-quiet btn-sm flex-1"
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!collapsed && <span className="text-xs">Collapse</span>}
            </button>

            <button
              onClick={() => setConfirmingLogout(true)}
              aria-label="Log out"
              className="btn btn-danger btn-sm flex-1"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="text-xs">Log out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
            />
            <motion.aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={reduceMotion ? false : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={reduceMotion ? { x: 0 } : { x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col justify-between border-r border-border bg-card md:hidden"
            >
              <div className="min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-4">
                  <BrandMark />
                  <button
                    onClick={onCloseMobile}
                    aria-label="Close menu"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/60"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-3 pb-4">
                  <NavItems collapsed={false} onNavigate={onCloseMobile} role={role} />
                </div>
              </div>

              <div className="space-y-3 border-t border-border p-3">
                {identity}
                <button onClick={() => setConfirmingLogout(true)} className="btn btn-danger w-full">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
