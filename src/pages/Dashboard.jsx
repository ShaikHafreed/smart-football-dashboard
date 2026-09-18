import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, RotateCw, Zap, Ruler, Activity, RadioTower, ArrowRight } from "lucide-react";

import SensorCard from "../components/dashboard/SensorCard";
import ConnectionPanel from "../components/dashboard/ConnectionPanel";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import FootballAnimation from "../components/dashboard/FootballAnimation";
import StatsSummaryBar from "../components/dashboard/StatsSummaryBar";
import PageHeader from "../components/common/PageHeader";
import StateBlock from "../components/common/StateBlock";
import MeasurementLegend from "../components/common/MeasurementLegend";
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
      <div className="animate-fadeIn space-y-6">
        <PageHeader
          eyebrow="Live"
          title="Dashboard"
          description="Pair a ball to start seeing kicks as they happen."
        />
        <StateBlock
          icon={RadioTower}
          title="No ball paired yet"
          message="Pair a ball on the Devices page and set it active — readings appear here the moment it starts reporting."
          action={
            <Link to="/devices" className="btn btn-primary">
              Go to Devices <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6 md:space-y-8">

      <PageHeader
        eyebrow="Live"
        title="Dashboard"
        description="Readings from the paired ball, as they land."
        actions={
          <Link to="/session" className="btn btn-primary">
            <Zap aria-hidden="true" className="h-4 w-4" /> Start a session
          </Link>
        }
      />

      {/* MEASUREMENTS — one instrument panel, not four floating cards */}
      <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
        <div className="hairline-grid grid-cols-2 lg:col-span-3">
          {/* Units follow what the sensor can actually justify — see
              firmware/smart_football/calibration.h. Speed and carry are
              indices, not km/h and metres. */}
          <SensorCard icon={<Gauge className="h-5 w-5" />} label="Speed index" value={data.speed} unit="" accentClass="text-foreground" live={data.connected} />
          <SensorCard icon={<RotateCw className="h-5 w-5" />} label="Spin" value={data.spin} unit="rpm" accentClass="text-foreground" live={data.connected} />
          <SensorCard icon={<Zap className="h-5 w-5" />} label="Impact" value={data.force} unit="g" accentClass="text-foreground" live={data.connected} />
          <SensorCard icon={<Ruler className="h-5 w-5" />} label="Carry index" value={data.distance} unit="" accentClass="text-foreground" live={data.connected} />
        </div>

        <ConnectionPanel status={connectionStatus} onReconnect={() => window.location.reload()} />
      </div>

      <MeasurementLegend />

      {/* SESSION SUMMARY */}
      <div className="hairline-grid grid-cols-2">
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Kicks this visit</p>
            <p className="font-data mt-2 text-3xl font-semibold tabular-nums">{kickCount}</p>
          </div>
          <Activity aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Last kick</p>
            <p className="mt-2 truncate text-lg font-semibold capitalize">{data.shot}</p>
          </div>
          <RadioTower aria-hidden="true" className={`h-4 w-4 shrink-0 ${data.connected ? "text-primary" : "text-muted-foreground"}`} />
        </div>
      </div>

      {previous && (
        <StatsSummaryBar
          current={{ kickForce: data.force, ballSpeed: data.speed, spinRate: data.spin }}
          previous={previous}
        />
      )}

      {/* TREND + LAST STRIKE */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChart history={chartData} />
        </div>
        <FootballAnimation kickForce={data.force} />
      </div>
    </div>
  );
}
