import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, LogOut, Pencil, Users, Zap, Calendar, User, ClipboardList, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import ConfirmDialog from "../components/ConfirmDialog";
import Panel from "../components/common/Panel";
import StateBlock from "../components/common/StateBlock";

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
    return <StateBlock variant="loading" title="Loading profile…" />;
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
      <div className="hairline-grid grid-cols-3">
        {[
          { label: "Players", value: stats.players, icon: Users },
          { label: "Shots recorded", value: stats.shots, icon: Zap },
          { label: "Age", value: calculateAge(profile.dob), icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="p-5">
            <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <p className="font-data mt-3 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* DETAILS CARD */}
      <Panel
        title="Account details"
        actions={
          !editMode && (
            <button onClick={() => setEditMode(true)} className="btn btn-quiet btn-sm">
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> Edit
            </button>
          )
        }
        bodyClassName="space-y-4"
      >
        <div>
          <p className="text-xs text-muted-foreground">Name</p>
          {editMode ? (
            <input
              name="full_name"
              value={profile.full_name || ""}
              onChange={handleChange}
              className="field mt-1.5"
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
              className="field mt-1.5"
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
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors
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
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? "Saving…" : "Save changes"}
            </motion.button>
            <button onClick={() => setEditMode(false)} className="btn btn-quiet flex-1">
              Cancel
            </button>
          </div>
        )}
      </Panel>

      <button onClick={() => setConfirmingLogout(true)} className="btn btn-danger w-full">
        <LogOut aria-hidden="true" className="h-4 w-4" /> Log out
      </button>

      {/* DANGER ZONE */}
      <div className="space-y-3 rounded-2xl border border-destructive/30 p-6">
        <div>
          <h2 className="font-display text-sm font-semibold text-destructive">Delete account</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Permanently deletes your account and everything tied to it — your profile, players you added,
            session history, recorded shots, and any paired devices or academy you own. This can't be undone.
          </p>
        </div>

        {deleteError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{deleteError}</p>
        )}

        <button onClick={() => setConfirmingDelete(true)} className="btn btn-danger w-full">
          <Trash2 aria-hidden="true" className="h-4 w-4" /> Delete my account
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
