import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, Loader2, LogOut, Pencil, Users, Zap, Calendar } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ players: 0, shots: 0 });
  const [loadError, setLoadError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // .maybeSingle() (not .single()) so a missing row returns null
      // instead of throwing and leaving the page stuck on "Loading…".
      let { data, error } = await supabase
        .from("football_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!data && !error) {
        // Edge case: the auto-provision trigger hasn't landed yet — create it now.
        const { data: created, error: upsertError } = await supabase
          .from("football_profiles")
          .upsert({ id: user.id })
          .select()
          .single();

        data = created;
        error = upsertError;
      }

      if (error) {
        setLoadError(error.message);
        return;
      }

      setProfile(data);

      const [{ count: playerCount }, { count: shotCount }] = await Promise.all([
        supabase.from("football_players").select("id", { count: "exact", head: true }),
        supabase
          .from("football_shots")
          .select("id, football_players!inner(user_id)", { count: "exact", head: true })
          .eq("football_players.user_id", user.id),
      ]);

      setStats({ players: playerCount || 0, shots: shotCount || 0 });
    };

    load();
  }, [user]);

  const calculateAge = (dob) => {
    if (!dob) return "-";
    const birth = new Date(dob);
    const diff = Date.now() - birth.getTime();
    return new Date(diff).getUTCFullYear() - 1970;
  };

  const handleChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfile({ ...profile, avatar_url: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);

    await supabase
      .from("football_profiles")
      .update({
        full_name: profile.full_name,
        dob: profile.dob,
        avatar_url: profile.avatar_url,
      })
      .eq("id", user.id);

    setSaving(false);
    setEditMode(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Couldn't load your profile: {loadError}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fadeIn">

      {/* HEADER CARD */}
      <div className="turf-texture relative overflow-hidden rounded-2xl border border-border bg-card p-8">
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <img
              src={profile.avatar_url || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(profile.full_name || user?.email || "?")}`}
              alt="avatar"
              className="h-24 w-24 rounded-full border-2 border-primary/40 object-cover"
            />
            {editMode && (
              <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Camera className="h-4 w-4" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>

          <div>
            <h1 className="font-display text-2xl font-semibold">
              {profile.full_name || "Unnamed Coach"}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="mt-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
              {profile.role || "coach"}
            </span>
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Players", value: stats.players, icon: Users },
          { label: "Shots Recorded", value: stats.shots, icon: Zap },
          { label: "Age", value: calculateAge(profile.dob), icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
            <Icon className="mx-auto mb-2 h-4 w-4 text-primary" />
            <p className="font-data text-2xl font-semibold">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* DETAILS CARD */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Account Details</h2>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Name</p>
          {editMode ? (
            <input
              name="full_name"
              value={profile.full_name || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/40 p-2.5 text-sm outline-none focus:border-primary"
            />
          ) : (
            <p className="mt-0.5 font-medium">{profile.full_name || "Not set"}</p>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Date of Birth</p>
          {editMode ? (
            <input
              type="date"
              name="dob"
              value={profile.dob || ""}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/40 p-2.5 text-sm outline-none focus:border-primary"
            />
          ) : (
            <p className="mt-0.5 font-medium">{profile.dob || "Not set"}</p>
          )}
        </div>

        {editMode && (
          <div className="flex gap-3 pt-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </motion.button>
            <button
              onClick={() => setEditMode(false)}
              className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
      >
        <LogOut className="h-4 w-4" /> Logout
      </button>
    </div>
  );
}
