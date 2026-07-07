import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ClipboardList, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";

const ROLES = [
  {
    value: "player",
    icon: User,
    title: "I'm a Player",
    description: "Track my own live speed, spin, force and shot history.",
  },
  {
    value: "coach",
    icon: ClipboardList,
    title: "I'm a Coach",
    description: "Manage a roster and compare performance across all my players.",
  },
];

export default function RoleSelect() {
  const [role, setRole] = useState("player");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleContinue = async () => {
    if (!user) return;

    setSaving(true);
    await supabase.from("football_profiles").update({ role }).eq("id", user.id);
    setSaving(false);

    navigate("/dashboard");
  };

  return (
    <div className="turf-texture floodlight-glow flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8"
      >
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold">How will you use Smart Football?</h1>
          <p className="mt-1 text-sm text-muted-foreground">You can change this later from your profile.</p>
        </div>

        <div className="space-y-3">
          {ROLES.map(({ value, icon: Icon, title, description }) => {
            const selected = role === value;
            return (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors
                  ${selected
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-secondary/30 hover:border-primary/30"}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleContinue}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
