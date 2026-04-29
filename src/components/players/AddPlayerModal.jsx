import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Input from "../ui/input";
import Button from "../ui/button";
import { base44 } from "../../api/base44Client";
import { differenceInYears } from "date-fns";

export default function AddPlayerModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    date_of_birth: "",
    kick_force: "",
    ball_speed: "",
    spin_rate: "",
  });

  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ✅ Save player locally
  const handleSave = async () => {
    if (!form.name.trim()) return;

    setSaving(true);

    const age = form.date_of_birth
      ? differenceInYears(new Date(), new Date(form.date_of_birth))
      : null;

    try {
      const created = await base44.entities.PlayerProfile.create({
        name: form.name.trim(),
        role: "player",
        date_of_birth: form.date_of_birth || undefined,
        age: age ?? undefined,
        kick_force: form.kick_force ? Number(form.kick_force) : undefined,
        ball_speed: form.ball_speed ? Number(form.ball_speed) : undefined,
        spin_rate: form.spin_rate ? Number(form.spin_rate) : undefined,
      });

      // ✅ callback to parent
      onCreated?.(created);

      // ✅ reset form
      setForm({
        name: "",
        date_of_birth: "",
        kick_force: "",
        ball_speed: "",
        spin_rate: "",
      });

      onClose();
    } catch (err) {
      console.error("Error creating player:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6 z-10"
          >
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">
                Add New Player
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Full Name *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Ali Hassan"
                  className="rounded-xl"
                />
              </div>

              {/* DOB */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Date of Birth
                </label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Force (N)
                  </label>
                  <Input
                    type="number"
                    value={form.kick_force}
                    onChange={(e) => set("kick_force", e.target.value)}
                    placeholder="350"
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Speed
                  </label>
                  <Input
                    type="number"
                    value={form.ball_speed}
                    onChange={(e) => set("ball_speed", e.target.value)}
                    placeholder="75"
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Spin
                  </label>
                  <Input
                    type="number"
                    value={form.spin_rate}
                    onChange={(e) => set("spin_rate", e.target.value)}
                    placeholder="1200"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 rounded-xl"
              >
                Cancel
              </Button>

              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 rounded-xl"
              >
                {saving ? "Saving..." : "Add Player"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}