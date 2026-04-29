import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, BarChart2, History, User } from "lucide-react";

export default function Sidebar({ isOpen, onToggle }) {
  const location = useLocation();

  const menu = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Players", path: "/players", icon: Users },
    { name: "Session", path: "/session", icon: BarChart2 },
    { name: "History", path: "/history", icon: History }, 
    { name: "Compare", path: "/compare", icon: BarChart2 },
    { name: "Profile", path: "/profile", icon: User },
  ];

  return (
    <div className={`h-screen bg-slate-900 text-white p-4 transition-all duration-300 ${isOpen ? "w-64" : "w-16"}`}>
      
      {/* Toggle */}
      <button onClick={onToggle} className="mb-6">
        ☰
      </button>

      {/* Logo */}
      <h1 className="text-lg font-bold mb-8">⚽ Smart</h1>

      {/* Menu */}
      <div className="space-y-3">
        {menu.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 p-3 rounded-lg transition 
                ${active ? "bg-blue-600" : "hover:bg-slate-800"}`}
            >
              <Icon size={18} />
              {isOpen && <span>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}