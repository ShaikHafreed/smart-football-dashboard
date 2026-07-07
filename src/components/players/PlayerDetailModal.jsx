import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Gauge, RotateCw, Zap, Ruler, Loader2, Pencil, Camera } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import SessionList from "../performance/SessionList";

export default function PlayerDetailModal({ player, onClose, onUpdated }) {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [fields, setFields] = useState({ dob: "", avatar_url: "" });
  const [saving, setSaving] = useState(false);

  // player is only ever non-null once its id is present, but this component
  // stays mounted permanently (only its content is conditionally rendered
  // via AnimatePresence below), so every access to it here is optional —
  // there is no point in the mount/prop-change lifecycle where `player.x`
  // is safe to read without the `?.`.
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    setFields({ dob: player?.dob || "", avatar_url: player?.avatar_url || "" });

    supabase
      .from("football_shots")
      .select("speed, spin, force, distance, shot_type, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setShots(data || []);
        setLoading(false);
      });
  }, [playerId]);

  const bests = shots.reduce(
    (acc, s) => ({
      speed: Math.max(acc.speed, s.speed || 0),
      spin: Math.max(acc.spin, s.spin || 0),
      force: Math.max(acc.force, s.force || 0),
      distance: Math.max(acc.distance, s.distance || 0),
    }),
    { speed: 0, spin: 0, force: 0, distance: 0 }
  );

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFields((f) => ({ ...f, avatar_url: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!playerId) return;
    setSaving(true);
    await supabase.from("football_players").update(fields).eq("id", playerId);
    setSaving(false);
    setEditMode(false);
    onUpdated?.();
  };

  return (
    <AnimatePresence>
      {player && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-6 sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={fields.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(player?.name || "?")}`}
                    alt={player?.name || ""}
                    className="h-12 w-12 rounded-full border border-primary/30 object-cover"
                  />
                  {editMode && (
                    <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Camera className="h-3 w-3" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold">{player?.name}</h2>
                  {editMode ? (
                    <input
                      type="date"
                      value={fields.dob}
                      onChange={(e) => setFields((f) => ({ ...f, dob: e.target.value }))}
                      className="mt-0.5 rounded border border-border bg-secondary/40 px-2 py-1 text-xs"
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">{player?.dob || "No DOB set"}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editMode ? (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                ) : (
                  <button onClick={() => setEditMode(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Speed", value: bests.speed, unit: "km/h", icon: Gauge, color: "text-primary" },
                    { label: "Spin", value: bests.spin, unit: "rpm", icon: RotateCw, color: "text-blue-400" },
                    { label: "Force", value: bests.force, unit: "N", icon: Zap, color: "text-amber-400" },
                    { label: "Distance", value: bests.distance, unit: "m", icon: Ruler, color: "text-fuchsia-400" },
                  ].map(({ label, value, unit, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
                      <Icon className={`mx-auto h-4 w-4 ${color}`} />
                      <p className="font-data mt-1 text-lg font-semibold">{value}</p>
                      <p className="text-[11px] text-muted-foreground">Best {label} ({unit})</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Performance by Session</p>
                  {playerId && <SessionList playerIds={[playerId]} />}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
