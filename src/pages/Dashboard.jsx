import { useEffect, useState } from "react";
import FootballField from "../components/FootballField";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function Dashboard() {
  const SERVER = "http://127.0.0.1:5000";

  const [mode, setMode] = useState("none");

  const [data, setData] = useState({
    speed: 0,
    spin: 0,
    force: 0,
    distance: 0,
    shot: "none",
    connected: false,
  });

  const [history, setHistory] = useState([]);

  // 🔄 FETCH LOOP
  useEffect(() => {
    if (mode === "none") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER}/data`);
        const json = await res.json();

        setData(json);

        // ONLY UPDATE GRAPH WHEN CONNECTED
        if (json.connected) {
          setHistory((prev) => [
            ...prev.slice(-30),
            {
              time: new Date().toLocaleTimeString(),
              speed: json.speed,
              spin: json.spin,
            },
          ]);
        }
      } catch (err) {
        console.log("Backend not reachable");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [mode]);

  // 🔘 API CALL
  const apiPost = async (url, body = {}) => {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  return (
    <div className="p-6 space-y-6">

      {/* FIELD */}
      <FootballField speed={data.speed} />

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">⚽ Smart Dashboard</h1>

        <span className={`px-3 py-1 rounded-full text-sm ${
          data.connected
            ? "bg-green-100 text-green-600"
            : "bg-red-100 text-red-600"
        }`}>
          {data.connected ? "Hardware Connected" : "No Hardware"}
        </span>
      </div>

      {/* 🔘 BUTTONS */}
      <div className="flex gap-3">
        <button
          onClick={async () => {
            setMode("wifi");
            await apiPost(`${SERVER}/mode`, { mode: "wifi" });
          }}
          className="bg-green-500 text-white px-4 py-2 rounded-lg shadow"
        >
          📶 WiFi
        </button>

        <button
          onClick={async () => {
            setMode("bluetooth");
            await apiPost(`${SERVER}/mode`, { mode: "bluetooth" });
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow"
        >
          🔵 Bluetooth
        </button>

        <button
          onClick={async () => {
            setMode("none");
            await apiPost(`${SERVER}/disconnect`);
          }}
          className="bg-red-500 text-white px-4 py-2 rounded-lg shadow"
        >
          ❌ Disconnect
        </button>
      </div>

      {/* SHOT */}
      <div className="bg-yellow-100 p-3 rounded">
        ⚡ Shot Type: {data.shot}
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Speed" value={data.speed} />
        <Card title="Spin" value={data.spin} />
        <Card title="Force" value={data.force} />
        <Card title="Distance" value={data.distance} />
      </div>

      {/* 📈 GRAPH */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h2 className="mb-3 font-semibold">📊 Live Performance</h2>

        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />

              <Line type="monotone" dataKey="speed" stroke="#22c55e" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="spin" stroke="#3b82f6" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="p-4 bg-white rounded-xl shadow text-center">
      <p className="text-gray-500">{title}</p>
      <h2 className="text-xl font-bold">{value}</h2>
    </div>
  );
}