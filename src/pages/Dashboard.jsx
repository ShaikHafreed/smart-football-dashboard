import { useState, useEffect } from "react";
import FootballField from "../components/FootballField";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [kick, setKick] = useState(false);
  const [stats, setStats] = useState({
    maxSpin: 0,
    avgSpin: 0,
    bestShot: 0,
  });

  const SERVER_URL = "http://192.168.29.254:5000/data";

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(SERVER_URL);
        const json = await res.json();

        const spin = json.spin || 0;

        // 🔥 KICK DETECTION
        if (spin > 1500) {
          setKick(true);
          setTimeout(() => setKick(false), 600);
        }

        setData((prev) => {
          const newData = [
            ...prev,
            { time: Date.now(), spin },
          ].slice(-20);

          const spins = newData.map((d) => d.spin);
          const maxSpin = Math.max(...spins);
          const avgSpin =
            spins.reduce((a, b) => a + b, 0) / spins.length;

          setStats((prevStats) => ({
            maxSpin,
            avgSpin: avgSpin.toFixed(0),
            bestShot:
              spin > prevStats.bestShot
                ? spin
                : prevStats.bestShot,
          }));

          return newData;
        });
      } catch (err) {
        console.log("Server error");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const latest = data[data.length - 1] || {};

  return (
    <div className="space-y-6">

      <h1 className="text-3xl font-bold flex items-center gap-2">
        Live Motion ⚽
        {kick && (
          <span className="bg-red-500 text-white px-3 py-1 rounded-full animate-bounce">
            🔥 KICK!
          </span>
        )}
      </h1>

      {/* 🔥 CARDS */}
      <div className="grid grid-cols-3 gap-4">
        <Card title="Current Spin" value={latest.spin} highlight={kick} />
        <Card title="Max Spin" value={stats.maxSpin} />
        <Card title="Avg Spin" value={stats.avgSpin} />
      </div>

      {/* 🔥 BEST SHOT */}
      <div className="bg-green-100 p-4 rounded-xl shadow">
        <h3 className="font-bold text-lg">🔥 Best Shot</h3>
        <p className="text-xl">{stats.bestShot}</p>
      </div>

      {/* 🔥 GRAPH */}
      <div className="bg-white p-5 rounded-xl shadow">
        <FootballField spin={latest.spin} />
        <h3 className="mb-3 font-semibold">Real-Time Spin</h3>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <XAxis hide dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="spin"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

/* 🔹 CARD */
function Card({ title, value, highlight }) {
  return (
    <div
      className={`p-4 rounded-xl shadow text-center transition ${
        highlight ? "bg-red-200 scale-105" : "bg-white"
      }`}
    >
      <p className="text-gray-500">{title}</p>
      <h2 className="text-2xl font-bold text-blue-600">
        {value || "--"}
      </h2>
    </div>
  );
}