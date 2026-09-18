import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wifi, Battery, Cpu, Check, RadioTower, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { authedFetch } from "../lib/flaskClient";
import ConfirmDialog from "../components/ConfirmDialog";
import PageHeader from "../components/common/PageHeader";
import Panel from "../components/common/Panel";
import StateBlock from "../components/common/StateBlock";

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

      <PageHeader
        eyebrow="Setup"
        title="Devices"
        description="Pair a ball to your account, and choose which one the Dashboard and Session pages listen to."
      />

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</p>
      )}

      {/* PAIRED DEVICES */}
      <div className="space-y-3">
        <h2 className="eyebrow">Your balls</h2>

        {myDevices.length === 0 && (
          <StateBlock
            icon={RadioTower}
            title="No ball paired yet"
            message="Power a ball on, then pair it below with the ID and code it prints to its serial monitor."
          />
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
                  <button onClick={() => setActive(d.id)} className="btn btn-quiet btn-sm">
                    Set active
                  </button>
                  )}

                  <button onClick={() => setReleasing(d)} disabled={busy} className="btn btn-danger btn-sm">
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
      <Panel
        title="Pair a new ball"
        icon={RadioTower}
        description="Power the ball on and open its serial monitor. It prints a Device ID and a pairing code — the code proves you are the one holding it, so nobody else can pair it."
      >
        <form onSubmit={handleClaim} className="space-y-3">
          <div>
            <label htmlFor="device-uid" className="text-xs font-medium text-muted-foreground">Device ID</label>
            <input
              id="device-uid"
              value={claimUid}
              onChange={(e) => setClaimUid(e.target.value)}
              placeholder="From the serial monitor"
              className="field mt-1.5"
            />
          </div>

          <div>
            <label htmlFor="pairing-code" className="text-xs font-medium text-muted-foreground">Pairing code</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id="pairing-code"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                placeholder="8 characters"
                autoComplete="off"
                className="field font-data flex-1 tracking-[0.2em]"
              />
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />} Pair ball
              </button>
            </div>
          </div>
        </form>
      </Panel>
    </div>
  );
}
