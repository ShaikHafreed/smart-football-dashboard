import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Copy, Check, Shield, Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

export default function Organization() {
  const { user, org, refreshOrg } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!org) return;

    (async () => {
      const { data: memberRows } = await supabase
        .from("football_org_members")
        .select("user_id, role, joined_at")
        .eq("org_id", org.id)
        .order("joined_at", { ascending: true });

      const ids = (memberRows || []).map((m) => m.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("football_profiles").select("id, full_name").in("id", ids)
        : { data: [] };

      const nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
      setMembers((memberRows || []).map((m) => ({ ...m, name: nameById[m.user_id] || null })));
    })();
  }, [org]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim() || !user) return;

    setBusy(true);
    setError("");

    const { error: createError } = await supabase
      .from("football_organizations")
      .insert({ name: orgName.trim(), owner_id: user.id });

    setBusy(false);

    if (createError) {
      setError(createError.message);
      return;
    }

    setOrgName("");
    await refreshOrg();
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setBusy(true);
    setError("");

    const { error: joinError } = await supabase.rpc("join_org_by_code", { code: joinCode.trim() });

    setBusy(false);

    if (joinError) {
      setError("That code didn't match an organization — double check it and try again.");
      return;
    }

    setJoinCode("");
    await refreshOrg();
  };

  const copyCode = () => {
    navigator.clipboard.writeText(org.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!org) {
    return (
      <div className="mx-auto max-w-lg space-y-6 animate-fadeIn">
        <div>
          <h1 className="font-display text-2xl font-semibold">Organization</h1>
          <p className="text-sm text-muted-foreground">
            Create an academy so every coach on your staff shares one roster, instead of each coach only
            seeing the players they personally added.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
        )}

        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Create an academy</h2>
          <div className="flex gap-2">
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Riverside Football Academy"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </form>

        <form onSubmit={handleJoin} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Join an existing academy</h2>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} coach{members.length === 1 ? "" : "es"} sharing this roster
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Invite code</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Share this with another coach — they enter it on their own Organization page to join and see this
          same roster.
        </p>
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-3">
          <span className="font-data text-lg tracking-wider">{org.invite_code}</span>
          <button onClick={copyCode} className="flex items-center gap-1.5 text-xs font-medium text-primary">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground">Coaches</h2>
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <motion.div
              key={m.user_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">
                {m.user_id === user.id ? "You" : m.name || `Coach ${m.user_id.slice(0, 8)}`}
              </span>
              {m.role === "admin" && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <Shield className="h-3 w-3" /> Admin
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
