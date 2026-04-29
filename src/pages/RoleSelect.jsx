import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Users } from "lucide-react";

const roles = [
  {
    id: "player",
    label: "Player",
    description: "Track your performance, analyze kicks, and improve your game.",
    icon: User,
  },
  {
    id: "coach",
    label: "Coach",
    description: "Monitor team stats, review sessions, and guide players.",
    icon: Users,
  },
];

export default function RoleSelect() {
  const navigate = useNavigate();

  const handleSelect = (role) => {
    localStorage.setItem("fb_role", role);
    navigate("/onboarding/name");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">⚽</div>
          <h1 className="text-2xl font-bold text-foreground">Choose Your Role</h1>
          <p className="text-muted-foreground mt-2">Select how you'll use the platform</p>
        </div>

        <div className="grid gap-4">
          {roles.map((role, i) => (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.4 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(role.id)}
              className="w-full flex items-center gap-5 p-6 bg-card rounded-xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <role.icon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{role.label}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{role.description}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}