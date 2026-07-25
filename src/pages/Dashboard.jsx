import { useEffect, useRef, useState } from "react";
import { Gauge, RotateCw, Zap, Ruler, Activity, Clock } from "lucide-react";

import SensorCard from "../components/dashboard/SensorCard";
import ConnectionPanel from "../components/dashboard/ConnectionPanel";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import FootballAnimation from "../components/dashboard/FootballAnimation";
import StatsSummaryBar from "../components/dashboard/StatsSummaryBar";
import { FLASK_URL } from "../lib/flaskClient";

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

  // Tracks the last reading's id (server timestamp) so we only count/chart
  // each kick once, instead of once per 1s poll while it's still the latest reading.
  const lastSeenIdRef = useRef(null);

  // =========================
  // FETCH API DATA
  // =========================

  useEffect(() => {

    const fetchData = async () => {

      try {

        const response =
          await fetch(`${FLASK_URL}/data`);

        const result =
          await response.json();

        setData(result);

        // =========================
        // IF CONNECTED
        // =========================

        if (result.connected) {

          const isNewReading = result.id !== lastSeenIdRef.current;
          lastSeenIdRef.current = result.id;

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

        // =========================
        // IF DISCONNECTED
        // =========================

        else {

          setData({
            speed: 0,
            spin: 0,
            force: 0,
            distance: 0,
            shot: "Disconnected",
            connected: false,
          });
        }

      } catch (error) {

        setData({
          speed: 0,
          spin: 0,
          force: 0,
          distance: 0,
          shot: "Kick Not Detected",
          connected: false,
        });
      }
    };

    fetchData();

    const interval =
      setInterval(fetchData, 1000);

    return () => clearInterval(interval);

  }, []);

  const connectionStatus = data.connected ? "connected" : "disconnected";

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
