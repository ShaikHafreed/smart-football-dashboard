import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Input from "../../components/ui/input";
import Button from "../../components/ui/button";
import { ArrowRight } from "lucide-react";
import { differenceInYears } from "date-fns";

export default function DOBInput() {
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // ✅ Calculate age
  const age = useMemo(() => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const years = differenceInYears(new Date(), birthDate);
    return years >= 0 && years < 120 ? years : null;
  }, [dob]);

  // ✅ Handle continue (NO base44)
  const handleContinue = () => {
    if (age === null) return;

    setSaving(true);

    const name = localStorage.getItem("fb_name") || "Player";
    const role = localStorage.getItem("fb_role") || "player";

    // ✅ Save everything locally
    localStorage.setItem("fb_name", name);
    localStorage.setItem("fb_role", role);
    localStorage.setItem("fb_dob", dob);
    localStorage.setItem("fb_age", age);

    // simulate delay for UX
    setTimeout(() => {
      navigate("/dashboard");
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🎂</div>
            <h1 className="text-2xl font-bold text-foreground">
              Date of Birth
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              We'll calculate your age automatically
            </p>
          </div>

          {/* Form */}
          <div className="space-y-5">
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="h-12 text-base rounded-xl"
              max={new Date().toISOString().split("T")[0]}
            />

            {/* Age Animation */}
            <AnimatePresence>
              {age !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-center py-6 bg-primary/5 rounded-xl border border-primary/10"
                >
                  <motion.span
                    key={age}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-bold text-primary"
                  >
                    {age}
                  </motion.span>
                  <p className="text-muted-foreground text-sm mt-1">
                    years old
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Button */}
            <Button
              onClick={handleContinue}
              disabled={age === null || saving}
              className="w-full h-12 rounded-xl text-base font-medium gap-2"
            >
              {saving ? "Setting up..." : "Get Started"}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </Button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}