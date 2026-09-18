import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Copy, Check, Shield, Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PageHeader from "../components/common/PageHeader";
import Panel from "../components/common/Panel";

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
        <PageHeader
          eyebrow="Setup"
          title="Organization"
          description="Create an academy so every coach on your staff shares one roster, instead of each coach only seeing the players they added themselves."
        />

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        <Panel title="Create an academy" icon={Building2}>
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="org-name" className="sr-only">Academy name</label>
            <input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Riverside Football Academy"
              className="field flex-1"
            />
            <button type="submit" disabled={busy} className="btn btn-primary">Create</button>
          </form>
        </Panel>

        <Panel title="Join an existing academy" icon={Users}>
          <form onSubmit={handleJoin} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="join-code" className="sr-only">Invite code</label>
            <input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              className="field font-data flex-1 tracking-[0.2em]"
            />
            <button type="submit" disabled={busy} className="btn btn-quiet">Join</button>
          </form>
        </Panel>
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

      <Panel
        title="Invite code"
        description="Share this with another coach — they enter it on their own Organization page to join this roster."
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
          <span className="font-data text-lg tracking-[0.2em]">{org.invite_code}</span>
          <button onClick={copyCode} className="btn btn-quiet btn-sm">
            {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </Panel>

      <Panel title="Coaches" icon={Users} actions={<span className="text-xs text-muted-foreground">{members.length}</span>}>
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
      </Panel>
    </div>
  );
}
