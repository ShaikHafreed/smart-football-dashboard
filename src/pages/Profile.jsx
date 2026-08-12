import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, Loader2, LogOut, Pencil, Users, Zap, Calendar, User, ClipboardList, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import ConfirmDialog from "../components/ConfirmDialog";

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile: authProfile, refreshProfile, ensureSelfPlayer, signOut } = useAuth();
  const [profile, setProfile] = useState(authProfile);
  const [stats, setStats] = useState({ players: 0, shots: 0 });
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setProfile(authProfile);
  }, [authProfile]);

  useEffect(() => {
    if (!user) return;

    const loadStats = async () => {
      try {
        const { data: players } = await supabase
          .from("football_players")
          .select("id");

        const ids = (players || []).map((p) => p.id);

        const { count: shotCount } = ids.length
          ? await supabase
              .from("football_shots")
              .select("id", { count: "exact", head: true })
              .in("player_id", ids)
          : { count: 0 };

        setStats({ players: ids.length, shots: shotCount || 0 });
      } catch (e) {
        console.warn("Failed to load profile stats", e);
      }
    };

    loadStats();
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
        role: profile.role,
      })
      .eq("id", user.id);

    await refreshProfile();

    if (profile.role === "player" && !localStorage.getItem("activePlayerId")) {
      const selfPlayerId = await ensureSelfPlayer();
      if (selfPlayerId) localStorage.setItem("activePlayerId", selfPlayerId);
    }

    setSaving(false);
    setEditMode(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");

    try {
      const resp = await authedFetch("/api/account", { method: "DELETE" });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't delete your account — try again.");
      }

      // The account (and every player/session/shot/device/org it owned,
      // cascaded at the database level) is gone -- nothing left to sign
      // out of client-side except the now-invalid local session.
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

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
              {profile.full_name || "Unnamed"}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="mt-2 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
              {profile.role || "player"}
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
          <div>
            <p className="text-xs text-muted-foreground">Role</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {[
                { value: "player", label: "Player", icon: User },
                { value: "coach", label: "Coach", icon: ClipboardList },
              ].map(({ value, label, icon: Icon }) => {
                const selected = (profile.role || "player") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProfile({ ...profile, role: value })}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors
                      ${selected ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
        onClick={() => setConfirmingLogout(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
      >
        <LogOut className="h-4 w-4" /> Logout
      </button>

      {/* DANGER ZONE */}
      <div className="space-y-3 rounded-2xl border border-destructive/30 p-6">
        <div>
          <h2 className="font-display text-sm font-semibold text-destructive">Delete account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently deletes your account and everything tied to it — your profile, players you added,
            session history, recorded shots, and any paired devices or academy you own. This can't be undone.
          </p>
        </div>

        {deleteError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{deleteError}</p>
        )}

        <button
          onClick={() => setConfirmingDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> Delete my account
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/legal" className="underline hover:text-primary">Privacy Policy &amp; Terms</Link>
      </p>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        message="You'll need to log back in to see your dashboard, players and history."
        confirmLabel="Log out"
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your account permanently?"
        message="This immediately and permanently deletes your account, profile, players, sessions, shots, and any devices or academy you own. There is no way to recover this afterward."
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => { setConfirmingDelete(false); handleDeleteAccount(); }}
      />
    </div>
  );
}
