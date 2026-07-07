import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  LayoutDashboard,
  Users,
  Zap,
  History as HistoryIcon,
  Settings,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../lib/AuthContext";

const MENU = [
  { name: "Leaderboard", path: "/leaderboard", icon: Trophy },
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Players", path: "/players", icon: Users },
  { name: "Session", path: "/session", icon: Zap },
  { name: "History", path: "/history", icon: HistoryIcon },
  { name: "Profile", path: "/profile", icon: Settings },
];

function NavItems({ collapsed, onNavigate }) {
  return (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
              ${isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity
                    ${isActive ? "opacity-100" : "opacity-0"}`}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`hidden md:flex flex-col justify-between border-r border-border bg-card transition-[width] duration-200
          ${collapsed ? "w-[76px]" : "w-64"}`}
      >
        <div>
          <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? "justify-center px-0" : ""}`}>
            <span className="text-2xl">⚽</span>
            {!collapsed && (
              <span className="font-display text-lg font-semibold tracking-tight">Smart Ball</span>
            )}
          </div>

          <div className="px-3">
            <NavItems collapsed={collapsed} />
          </div>
        </div>

        <div className="space-y-3 p-3">
          <button
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            onClick={handleLogout}
            className={`flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors
              ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Logout"}
          </button>
        </div>
      </aside>

      {/* Mobile off-canvas drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col justify-between border-r border-border bg-card p-3 md:hidden"
            >
              <div>
                <div className="flex items-center justify-between px-2 py-3">
                  <span className="flex items-center gap-2 font-display text-lg font-semibold">
                    ⚽ Smart Ball
                  </span>
                  <button
                    onClick={onCloseMobile}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <NavItems collapsed={false} onNavigate={onCloseMobile} />
              </div>

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
