import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wifi, Battery, Cpu, Check, RadioTower, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import ConfirmDialog from "../components/ConfirmDialog";

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
  const [claimUid, setClaimUid] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [activeDeviceId, setActiveDeviceId] = useState(localStorage.getItem("activeDeviceId") || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState(null);

  const load = async () => {
    // Only devices this account owns — there is deliberately no listing of
    // unclaimed devices any more. Pairing is by ID + code from the ball
    // itself, so nothing needs to advertise which balls are up for grabs.
    const { data: mine } = await supabase
      .from("football_devices")
      .select("*")
      .order("created_at", { ascending: false });
    setMyDevices(mine || []);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!claimUid.trim() || !pairingCode.trim()) {
      setError("Enter both the Device ID and the pairing code shown on the ball's Serial monitor.");
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);

    try {
      // The server is the only authority on this: it checks the pairing
      // code against a hash, so a ball can only be claimed by whoever can
      // actually read the code off it.
      const resp = await authedFetch("/api/device/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_uid: claimUid.trim(),
          pairing_code: pairingCode.trim(),
        }),
      });

      const body = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setError(body.error || "Couldn't pair that ball — check the ID and code and try again.");
        return;
      }

      setClaimUid("");
      setPairingCode("");
      setNotice("Ball paired.");
      await load();
    } catch (err) {
      setError(err.message || "Couldn't reach the pairing service — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async (device) => {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const resp = await authedFetch("/api/device/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: device.id }),
      });

      const body = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setError(body.error || "Couldn't release that ball — try again.");
        return;
      }

      if (activeDeviceId === device.id) {
        localStorage.removeItem("activeDeviceId");
        setActiveDeviceId("");
      }

      setNotice("Ball released. Power-cycle it to pair it again — it will print a new pairing code.");
      await load();
    } catch (err) {
      setError(err.message || "Couldn't reach the device service — try again.");
    } finally {
      setBusy(false);
      setReleasing(null);
    }
  };

  const setActive = (deviceId) => {
    localStorage.setItem("activeDeviceId", deviceId);
    setActiveDeviceId(deviceId);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fadeIn">
      <ConfirmDialog
        open={!!releasing}
        title="Release this ball?"
        message="Its credentials are revoked immediately and it stops reporting to your account. To use it again, power-cycle it and pair it with the new code it prints."
        confirmLabel="Release"
        onCancel={() => setReleasing(null)}
        onConfirm={() => handleRelease(releasing)}
      />

      <div>
        <h1 className="font-display text-2xl font-semibold">Devices</h1>
        <p className="text-sm text-muted-foreground">
          Pair a physical ball to your account, and pick which one the Dashboard and Session pages listen to.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm text-primary">{notice}</p>
      )}

      {/* PAIRED DEVICES */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Your balls</h2>

        {myDevices.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No ball paired yet — pair one below using the ID and code it prints on startup.
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

                <div className="flex items-center gap-2">
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

                  <button
                    onClick={() => setReleasing(d)}
                    disabled={busy}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
                  >
                    Release
                  </button>
                </div>
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

      {/* PAIR A DEVICE */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Pair a new ball</h2>

        <p className="text-xs text-muted-foreground">
          Power the ball on and open its Serial monitor. It prints a <strong>Device ID</strong> and a{" "}
          <strong>pairing code</strong> — both are needed here. The code proves you're the one holding the
          ball, so nobody else can pair it.
        </p>

        <form onSubmit={handleClaim} className="space-y-2">
          <input
            value={claimUid}
            onChange={(e) => setClaimUid(e.target.value)}
            placeholder="Device ID (from Serial monitor)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex gap-2">
            <input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="Pairing code"
              autoComplete="off"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-data text-sm tracking-widest outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pair
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
