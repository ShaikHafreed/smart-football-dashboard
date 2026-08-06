import { useEffect, useRef, useState } from "react";
import { Gauge, RotateCw, Zap, Ruler, Activity, Clock } from "lucide-react";

import SensorCard from "../components/dashboard/SensorCard";
import ConnectionPanel from "../components/dashboard/ConnectionPanel";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import FootballAnimation from "../components/dashboard/FootballAnimation";
import StatsSummaryBar from "../components/dashboard/StatsSummaryBar";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {

  const [data, setData] = useState({
    speed: 0,
    spin: 0,
    force: 0,
    distance: 0,
    shot: "No Shot",
    connected: false,
  });

  const [kickCount, setKickCount] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [previous, setPrevious] = useState(null);
  const activeDeviceId = localStorage.getItem("activeDeviceId") || "";

  // Tracks the last reading's timestamp so we only count/chart each kick
  // once, instead of once per re-render while it's still the latest reading.
  const lastSeenAtRef = useRef(null);
  // Latest known device row, so the client-side staleness check below can
  // recompute "connected" without making a network call every second.
  const latestRowRef = useRef(null);

  // =========================
  // LIVE DATA — Supabase Realtime, not polling.
  //
  // The backend writes last_speed/last_spin/last_force/last_distance to
  // this device's football_devices row on every reading (see
  // backend/server.py's touch_device). Subscribing to UPDATE events on
  // that one row means the dashboard updates the instant a kick lands,
  // instead of waiting up to 1s for the next poll — and it's one open
  // websocket instead of a fetch every second, RLS-scoped so this only
  // ever works for a device this account actually owns.
  // =========================

  useEffect(() => {

    if (!activeDeviceId) return;

    let cancelled = false;

    const applyRow = (row) => {
      if (!row || cancelled) return;
      latestRowRef.current = row;

      const hasReading = row.last_reading_at != null;
      const stale = !hasReading || Date.now() - new Date(row.last_reading_at).getTime() > 5000;

      const result = {
        speed: row.last_speed ?? 0,
        spin: row.last_spin ?? 0,
        force: row.last_force ?? 0,
        distance: row.last_distance ?? 0,
        shot: stale ? "Disconnected" : (row.last_shot || "Kick Not Detected"),
        connected: !stale,
      };

      setData(result);

      if (!stale) {
        const isNewReading = row.last_reading_at !== lastSeenAtRef.current;
        lastSeenAtRef.current = row.last_reading_at;

        if (isNewReading) {
          setKickCount((prev) => prev + 1);

          setPrevious((prev) => prev ?? { kickForce: result.force, ballSpeed: result.speed, spinRate: result.spin });

          setChartData((prev) => {
            const next = [
              ...prev.slice(-14),
              {
                time: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
                kickForce: result.force,
                ballSpeed: result.speed,
                spinRate: result.spin,
              },
            ];

            setPrevious(prev[prev.length - 1]
              ? { kickForce: prev[prev.length - 1].kickForce, ballSpeed: prev[prev.length - 1].ballSpeed, spinRate: prev[prev.length - 1].spinRate }
              : null);

            return next;
          });
        }
      }
    };

    // Realtime only pushes future changes, so fetch current state once up front.
    supabase
      .from("football_devices")
      .select("*")
      .eq("id", activeDeviceId)
      .single()
      .then(({ data: row }) => applyRow(row));

    const channel = supabase
      .channel(`device-live-${activeDeviceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "football_devices", filter: `id=eq.${activeDeviceId}` },
        (payload) => applyRow(payload.new)
      )
      .subscribe();

    // No network call here — just re-derives "connected" from whatever
    // row we already have, so a ball that stops sending still flips to
    // "Disconnected" within a few seconds instead of looking live forever.
    const staleTick = setInterval(() => applyRow(latestRowRef.current), 1000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(staleTick);
    };

  }, [activeDeviceId]);

  const connectionStatus = data.connected ? "connected" : "disconnected";

  if (!activeDeviceId) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center animate-fadeIn">
        <p className="font-medium">No ball paired yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Head to the Devices page to pair a ball and set it active before live data shows up here.
        </p>
        <a href="/devices" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Go to Devices
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* TITLE + SHOT BANNER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Smart Analytics</h1>
          <p className="text-sm text-muted-foreground">Live telemetry from the pitch</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Shot:</span>
          <span className="font-medium capitalize">{data.shot}</span>
        </div>
      </div>

      {/* SENSOR GRID + CONNECTION */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="grid grid-cols-2 gap-4 lg:col-span-3">
          <SensorCard icon={<Gauge className="h-5 w-5" />} label="Speed" value={data.speed} unit="km/h" color="bg-primary/10 text-primary" accentClass="text-primary" />
          <SensorCard icon={<RotateCw className="h-5 w-5" />} label="Spin" value={data.spin} unit="rpm" color="bg-blue-500/10 text-blue-400" accentClass="text-blue-400" />
          <SensorCard icon={<Zap className="h-5 w-5" />} label="Force" value={data.force} unit="N" color="bg-amber-500/10 text-amber-400" accentClass="text-amber-400" />
          <SensorCard icon={<Ruler className="h-5 w-5" />} label="Distance" value={data.distance} unit="m" color="bg-fuchsia-500/10 text-fuchsia-400" accentClass="text-fuchsia-400" />
        </div>

        <ConnectionPanel status={connectionStatus} onReconnect={() => window.location.reload()} />
      </div>

      {/* TOTAL KICKS / LAST KICK */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" /> Total Kicks
          </div>
          <p className="font-data mt-2 text-4xl font-semibold">{kickCount}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> Last Kick
          </div>
          <p className="mt-2 text-2xl font-semibold capitalize">{data.shot}</p>
        </div>
      </div>

      {previous && (
        <StatsSummaryBar
          current={{ kickForce: data.force, ballSpeed: data.speed, spinRate: data.spin }}
          previous={previous}
        />
      )}

      {/* LIVE PERFORMANCE + SIGNATURE BALL FEED */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChart history={chartData} />
        </div>
        <FootballAnimation kickForce={data.force} />
      </div>
    </div>
  );
}
