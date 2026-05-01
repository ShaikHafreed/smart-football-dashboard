import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Session from "./pages/Session";
import History from "./pages/History";
import Profile from "./pages/Profile";

import NameInput from "./pages/onboarding/NameInput";
import DOBInput from "./pages/onboarding/DOBInput";

/* 🔹 Sidebar Layout */
function Layout({ children }) {
  const location = useLocation();

  const menu = [
    { name: "Dashboard", path: "/dashboard", icon: "🏠" },
    { name: "Players", path: "/players", icon: "👤" },
    { name: "Session", path: "/session", icon: "⚡" },
    { name: "History", path: "/history", icon: "📊" },
    { name: "Profile", path: "/profile", icon: "⚙️" },
  ];

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar */}
      <div className="w-64 bg-gradient-to-b from-blue-900 to-indigo-800 text-white p-5">
        <h1 className="text-2xl font-bold mb-6">⚽ Smart Ball</h1>

        {menu.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`block px-4 py-2 rounded mb-2 ${
              location.pathname === item.path
                ? "bg-white text-blue-900"
                : "hover:bg-blue-700"
            }`}
          >
            {item.icon} {item.name}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

/* 🔹 App Routes */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* AUTH */}
        <Route path="/" element={<Login />} />
        <Route path="/onboarding/name" element={<NameInput />} />
        <Route path="/onboarding/dob" element={<DOBInput />} />

        {/* APP */}
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        <Route path="/players" element={<Layout><Players /></Layout>} />
        <Route path="/session" element={<Layout><Session /></Layout>} />
        <Route path="/history" element={<Layout><History /></Layout>} />
        <Route path="/profile" element={<Layout><Profile /></Layout>} />

        {/* 🔥 Prevent white screen */}
        <Route path="*" element={<Login />} />

      </Routes>
    </BrowserRouter>
  );
}