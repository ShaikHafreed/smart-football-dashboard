import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState(() => localStorage.getItem("lastEmail") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError.message);
      setGoogleLoading(false);
    }
    // On success the browser redirects to Google, so nothing else to do here.
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } =
      mode === "login" ? await signIn(email, password) : await signUp(email, password);

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Remembered locally so the email is pre-filled next time — never the password.
    // The password itself is offered by the browser's own credential manager via autoComplete below.
    localStorage.setItem("lastEmail", email);

    navigate(mode === "signup" ? "/onboarding/name" : "/dashboard");
  };

  const switchMode = () => {
    setError("");
    setMode((m) => (m === "login" ? "signup" : "login"));
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:grid md:grid-cols-2">

        {/* BRAND / SIGNATURE PANEL */}
        <div className="turf-texture floodlight-glow relative hidden flex-col justify-between overflow-hidden bg-card p-10 md:flex">
          <div className="relative z-10 flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="font-display text-lg font-semibold">Smart Football AI</span>
          </div>

          {/* signature pulse */}
          <div className="relative z-10 flex flex-1 items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center">
              <AnimatePresence>
                <motion.span
                  key="ring1"
                  initial={{ scale: 0.6, opacity: 0.8 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full border-2 border-primary/60"
                />
                <motion.span
                  key="ring2"
                  initial={{ scale: 0.6, opacity: 0.6 }}
                  animate={{ scale: 1.7, opacity: 0 }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                  className="absolute inset-0 rounded-full border border-primary/40"
                />
              </AnimatePresence>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                className="text-7xl"
              >
                ⚽
              </motion.span>
            </div>
          </div>

          <div className="relative z-10 space-y-1">
            <p className="font-display text-xl font-semibold leading-snug">
              Every kick,<br /> measured in real time.
            </p>
            <p className="text-sm text-muted-foreground">
              Speed, spin, force and distance — captured live from the pitch.
            </p>
          </div>
        </div>

        {/* FORM PANEL */}
        <div className="relative p-8 sm:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="font-display text-2xl font-semibold">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Log in to view your live analytics."
                  : "Set up a coach account to start tracking players."}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    id="email"
                    autoComplete="email"
                    placeholder="Email"
                    className="w-full rounded-lg border border-border bg-secondary/40 py-3 pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    name="password"
                    id="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Password (min 6 characters)"
                    className="w-full rounded-lg border border-border bg-secondary/40 py-3 pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Login" : "Sign Up"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                OR
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-medium transition-colors hover:bg-secondary/40 disabled:opacity-50"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z" />
                      <path fill="#FBBC05" d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.28a12 12 0 0 0 0 10.8l4.01-3.1Z" />
                      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.6l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              <button
                onClick={switchMode}
                className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {mode === "login" ? (
                  <>Need an account? <span className="font-medium text-primary">Sign up</span></>
                ) : (
                  <>Already have an account? <span className="font-medium text-primary">Login</span></>
                )}
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
