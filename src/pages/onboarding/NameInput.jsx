import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { ArrowRight } from "lucide-react";

export default function NameInput() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleContinue = () => {
    if (!name.trim()) return;
    localStorage.setItem("fb_name", name.trim());
    navigate("/onboarding/dob");
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
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">👤</div>
            <h1 className="text-2xl font-bold text-foreground">What's your name?</h1>
            <p className="text-muted-foreground mt-1 text-sm">This will be shown on your profile</p>
          </div>

          <div className="space-y-5">
            <Input
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              className="h-12 text-base rounded-xl"
              autoFocus
            />

            <Button
              onClick={handleContinue}
              disabled={!name.trim()}
              className="w-full h-12 rounded-xl text-base font-medium gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}