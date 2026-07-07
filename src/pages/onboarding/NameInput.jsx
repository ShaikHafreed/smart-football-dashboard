import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthContext";

export default function NameInput() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleNext = async () => {
    if (!name.trim() || !user) return;

    setSaving(true);
    await supabase.from("football_profiles").update({ full_name: name }).eq("id", user.id);
    setSaving(false);

    navigate("/onboarding/dob");
  };

  return (
    <div className="turf-texture floodlight-glow flex h-screen items-center justify-center bg-background p-4 text-foreground">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8"
      >
        <div className="text-center">
          <span className="text-3xl">👤</span>
          <h1 className="mt-2 font-display text-xl font-semibold">What's your name?</h1>
          <p className="mt-1 text-sm text-muted-foreground">This helps personalize your dashboard.</p>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
          placeholder="Enter your name"
          autoFocus
          className="w-full rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm outline-none focus:border-primary"
        />

        <button
          onClick={handleNext}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
