import { useAuth } from "../lib/AuthContext";
import Dashboard from "./Dashboard";
import CoachDashboard from "./CoachDashboard";

/** Same /dashboard URL, completely separate component per role. */
export default function DashboardRouter() {
  const { role } = useAuth();
  return role === "coach" ? <CoachDashboard /> : <Dashboard />;
}
