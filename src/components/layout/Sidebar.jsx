import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="w-64 bg-[#0f172a] text-white min-h-screen p-4">

      {/* LOGO */}
      <h1 className="text-xl font-bold mb-8">
        ⚽ Smart Football
      </h1>

      {/* MENU */}
      <nav className="space-y-3">

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          📊 Dashboard
        </NavLink>

        <NavLink
          to="/players"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          👥 Players
        </NavLink>

        <NavLink
          to="/session"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          ⚡ Session
        </NavLink>

        <NavLink
          to="/compare"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          📈 Compare
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          🕒 History
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 p-3 rounded-lg ${
              isActive ? "bg-blue-600" : "hover:bg-gray-700"
            }`
          }
        >
          👤 Profile
        </NavLink>

      </nav>
    </div>
  );
}