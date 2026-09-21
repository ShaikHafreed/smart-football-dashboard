import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";

import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./lib/AuthContext";
import { routeComponents, appLayoutLoader } from "./lib/routes";

/* Landing stays eagerly imported: it is the public entry point, and making
   the first thing a visitor sees wait on a second round trip would cost more
   than the split saves. Everything else loads on demand - see lib/routes.js
   for the registry and the prefetching that hides the latency. */
const AppLayout = lazy(appLayoutLoader);

const {
  "/login": Login,
  "/legal": Legal,
  "/auth/callback": AuthCallback,
  "/onboarding/name": NameInput,
  "/onboarding/dob": DOBInput,
  "/onboarding/role": RoleSelect,
  "/dashboard": DashboardRouter,
  "/analytics": PlayerAnalytics,
  "/leaderboard": Leaderboard,
  "/session": Session,
  "/history": History,
  "/devices": Devices,
  "/organization": Organization,
  "/profile": Profile,
} = routeComponents;

/** Shown only while a route chunk is in flight, so it must not itself be a
 *  reason to wait: no animation beyond a spinner, no data, no layout shift. */
function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/* 🚀 ROUTES */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>

            {/* 🌍 PUBLIC */}
            {/* "/" used to redirect straight to /login, so an unauthenticated
                visitor was asked to sign in before being told what this is.
                It is now the public landing page; a signed-in visitor still
                sees it, with its call to action pointing at their dashboard
                rather than at sign-up. */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/legal" element={<Legal />} />
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
              <Route path="/devices" element={<Devices />} />
              <Route path="/organization" element={<Organization />} />
              <Route path="/history" element={<History />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* FALLBACK — an unknown URL used to be redirected to "/" without
                explanation. It now says so, and offers the way back that fits
                whoever asked. */}
            <Route path="*" element={<NotFound />} />

          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
