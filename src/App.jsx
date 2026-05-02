import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Players from "./pages/Players";
import Session from "./pages/Session";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import ProtectedRoute from "./components/ProtectedRoute";
import NameInput from "./pages/onboarding/NameInput";
import DOBInput from "./pages/onboarding/DOBInput";

/* 🔥 PREMIUM SIDEBAR + TOPBAR LAYOUT */
function Layout({ children }) {
  const location = useLocation();

  const menu = [
    { name: "Leaderboard", path: "/leaderboard", icon: "🏆" },
    { name: "Dashboard", path: "/dashboard", icon: "🏠" },
    { name: "Players", path: "/players", icon: "👤" },
    { name: "Session", path: "/session", icon: "⚡" },
    { name: "History", path: "/history", icon: "📊" },
    { name: "Profile", path: "/profile", icon: "⚙️" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("name");
    localStorage.removeItem("dob");
    window.location.href = "/";
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-100 to-gray-200">

      {/* 🔵 SIDEBAR */}
      <div className="w-64 bg-gradient-to-b from-blue-900 via-indigo-900 to-purple-900 text-white p-5 flex flex-col justify-between shadow-xl">

        <div>
          <h1 className="text-2xl font-bold mb-8 flex items-center gap-2">
            ⚽ Smart Ball
          </h1>

          {menu.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-all duration-200
                ${
                  location.pathname === item.path
                    ? "bg-white text-blue-900 font-semibold shadow"
                    : "hover:bg-white/10"
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </div>

        {/* FOOTER */}
        <div className="text-sm text-gray-300 space-y-3">
          <p>⚡ Smart Football v1</p>

          <button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </div>

      {/* 🧊 MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* 🔥 TOP BAR */}
        <div className="h-16 bg-white/70 backdrop-blur-md shadow flex items-center justify-between px-6">

          <h2 className="font-semibold text-lg">
            Smart Analytics
          </h2>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Online</span>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* 📦 CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 🚀 ROUTES */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* 🔐 AUTH FLOW */}
        <Route path="/" element={<Navigate to="/onboarding/name" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding/name" element={<NameInput />} />
        <Route path="/onboarding/dob" element={<DOBInput />} />

        {/* 🔒 PROTECTED APP */}
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Leaderboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/players"
          element={
            <ProtectedRoute>
              <Layout>
                <Players />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/session"
          element={
            <ProtectedRoute>
              <Layout>
                <Session />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <Layout>
                <History />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" />} />

      </Routes>
    </BrowserRouter>
  );
}