import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import DashboardRouter from "./pages/DashboardRouter";
import PlayerAnalytics from "./pages/PlayerAnalytics";
import Session from "./pages/Session";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import AuthCallback from "./pages/AuthCallback";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import NameInput from "./pages/onboarding/NameInput";
import DOBInput from "./pages/onboarding/DOBInput";
import RoleSelect from "./pages/onboarding/RoleSelect";
import { AuthProvider } from "./lib/AuthContext";

/* 🚀 ROUTES */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* 🔐 AUTH FLOW */}
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/auth/callback"
            element={
              <ProtectedRoute>
                <AuthCallback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding/name"
            element={
              <ProtectedRoute>
                <NameInput />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding/dob"
            element={
              <ProtectedRoute>
                <DOBInput />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding/role"
            element={
              <ProtectedRoute>
                <RoleSelect />
              </ProtectedRoute>
            }
          />

          {/* 🔒 PROTECTED APP */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/dashboard" element={<DashboardRouter />} />
            <Route path="/analytics" element={<PlayerAnalytics />} />
            <Route path="/session" element={<Session />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          {/* FALLBACK */}
          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
