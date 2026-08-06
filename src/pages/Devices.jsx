import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wifi, Battery, Cpu, Check, RadioTower } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";

function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function Devices() {
  const { user } = useAuth();
  const [myDevices, setMyDevices] = useState([]);
  const [unclaimed, setUnclaimed] = useState([]);
  const [claimUid, setClaimUid] = useState("");
  const [activeDeviceId, setActiveDeviceId] = useState(localStorage.getItem("activeDeviceId") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: mine }, { data: open }] = await Promise.all([
      supabase.from("football_devices").select("*").order("created_at", { ascending: false }),
      supabase.from("football_devices_claimable").select("*").order("created_at", { ascending: false }),
    ]);
    setMyDevices(mine || []);
    setUnclaimed(open || []);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handleClaim = async (deviceUid) => {
    setError("");
    setBusy(true);

    const { data, error: claimError } = await supabase
      .from("football_devices")
      .update({ owner_id: user.id })
      .eq("device_uid", deviceUid)
      .is("owner_id", null)
      .select()
      .single();

    setBusy(false);

    if (claimError || !data) {
      setError("Couldn't claim that ball — it may have just been claimed by someone else. Refresh and try again.");
      return;
    }

    await load();
  };

  const handleClaimByCode = async (e) => {
    e.preventDefault();
    if (!claimUid.trim()) return;
    await handleClaim(claimUid.trim());
    setClaimUid("");
  };

  const setActive = (deviceId) => {
    localStorage.setItem("activeDeviceId", deviceId);
    setActiveDeviceId(deviceId);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold">Devices</h1>
        <p className="text-sm text-muted-foreground">
          Pair a physical ball to your account, and pick which one the Dashboard and Session pages listen to.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      {/* PAIRED DEVICES */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Your balls</h2>

        {myDevices.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No ball paired yet — claim one below once it's powered on and connected to Wi-Fi.
          </div>
        )}

        {myDevices.map((d) => {
          const isActive = d.id === activeDeviceId;
          const online = d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 15000;

          return (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-4 ${isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${online ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                    <RadioTower className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{d.name || "My Football"}</p>
                    <p className="text-xs text-muted-foreground">{d.device_uid}</p>
                  </div>
                </div>

                {isActive ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                    <Check className="h-3 w-3" /> Active
                  </span>
                ) : (
                  <button
                    onClick={() => setActive(d.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/60"
                  >
                    Set active
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-2">
                  <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.wifi_rssi != null ? `${d.wifi_rssi} dBm` : "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-2">
                  <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.battery_pct != null && d.battery_pct >= 0 ? `${d.battery_pct}%` : "unknown"}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-2">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.firmware_version || "—"}</span>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">Last seen {timeAgo(d.last_seen_at)}</p>
            </motion.div>
          );
        })}
      </div>

      {/* CLAIM A DEVICE */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Pair a new ball</h2>

        {unclaimed.length > 0 && (
          <div className="space-y-2">
            {unclaimed.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm">{d.device_uid}</span>
                <button
                  disabled={busy}
                  onClick={() => handleClaim(d.device_uid)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Claim
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          A ball shows up here automatically once it's powered on and reaches Wi-Fi for the first time. If you
          know its ID from the Serial monitor and it isn't showing up yet, enter it directly:
        </p>

        <form onSubmit={handleClaimByCode} className="flex gap-2">
          <input
            value={claimUid}
            onChange={(e) => setClaimUid(e.target.value)}
            placeholder="Device ID (from Serial monitor)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60 disabled:opacity-40"
          >
            Claim
          </button>
        </form>
      </div>
    </div>
  );
}
