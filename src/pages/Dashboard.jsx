import { useState, useEffect } from "react";
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
  const [recording, setRecording] = useState(false);
  const [wifi, setWifi] = useState(false);
  const [bluetooth, setBluetooth] = useState(false);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_players")) || [];
    setPlayers(stored);
  }, []);

  // LIVE DATA
  useEffect(() => {
    if (!recording || (!wifi && !bluetooth)) return;

    const interval = setInterval(() => {
      setData((prev) => {
        const newPoint = {
          time: new Date().toLocaleTimeString(),
          kick: Math.floor(Math.random() * 500),
          speed: Math.floor(Math.random() * 120),
          spin: Math.floor(Math.random() * 3000),
        };

        return [...prev, newPoint].slice(-20);
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [recording, wifi, bluetooth]);

  const latest = data[data.length - 1] || {};

  // 📊 ANALYTICS
  const avg = (key) =>
    data.length
      ? Math.round(data.reduce((a, b) => a + b[key], 0) / data.length)
      : 0;

  const max = (key) =>
    data.length ? Math.max(...data.map((d) => d[key])) : 0;

  const bestShot =
    data.length > 0
      ? data.reduce((best, curr) =>
          curr.kick + curr.speed + curr.spin >
          best.kick + best.speed + best.spin
            ? curr
            : best
        )
      : null;

  // SAVE SESSION
  const saveSession = () => {
    if (!selectedPlayer || data.length === 0) return;

    const history = JSON.parse(localStorage.getItem("fb_history")) || [];

    history.push({
      player: selectedPlayer,
      data,
      time: new Date().toLocaleString(),
    });

    localStorage.setItem("fb_history", JSON.stringify(history));
    alert("Session saved ✅");
  };

  return (
    <div className="space-y-8 p-6">

      <h1 className="text-3xl font-bold">Smart Football Dashboard ⚽</h1>

      {/* STATUS */}
      <div className="flex gap-3 flex-wrap">
        <span className={`px-3 py-1 rounded text-white ${wifi ? "bg-green-600" : "bg-gray-400"}`}>
          WiFi
        </span>
        <span className={`px-3 py-1 rounded text-white ${bluetooth ? "bg-blue-600" : "bg-gray-400"}`}>
          Bluetooth
        </span>
        <span className={`px-3 py-1 rounded text-white ${recording ? "bg-red-600" : "bg-gray-400"}`}>
          {recording ? "Recording" : "Stopped"}
        </span>
      </div>

      {/* PLAYER SELECT */}
      <select
        onChange={(e) => setSelectedPlayer(e.target.value)}
        className="border p-2 rounded"
      >
        <option>Select Player</option>
        {players.map((p, i) => (
          <option key={i}>{p.name}</option>
        ))}
      </select>

      {/* LIVE CARDS */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow">
          <p>Kick</p>
          <h2 className="text-2xl font-bold">{latest.kick || "--"} N</h2>
        </div>

        <div className="bg-white p-5 rounded-xl shadow">
          <p>Speed</p>
          <h2 className="text-2xl font-bold">{latest.speed || "--"} km/h</h2>
        </div>

        <div className="bg-white p-5 rounded-xl shadow">
          <p>Spin</p>
          <h2 className="text-2xl font-bold">{latest.spin || "--"} RPM</h2>
        </div>
      </div>

      {/* 📊 ANALYTICS CARDS */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Avg Kick</p>
          <h3 className="font-bold">{avg("kick")} N</h3>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Max Speed</p>
          <h3 className="font-bold">{max("speed")} km/h</h3>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <p className="text-sm text-gray-500">Max Spin</p>
          <h3 className="font-bold">{max("spin")} RPM</h3>
        </div>
      </div>

      {/* 🧠 BEST SHOT */}
      {bestShot && (
        <div className="bg-green-100 p-4 rounded-xl">
          <h3 className="font-semibold">🔥 Best Shot</h3>
          <p>Kick: {bestShot.kick}</p>
          <p>Speed: {bestShot.speed}</p>
          <p>Spin: {bestShot.spin}</p>
        </div>
      )}

      {/* GRAPH */}
      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="mb-3">Live Data</h3>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />

            <Line dataKey="kick" stroke="#3b82f6" />
            <Line dataKey="speed" stroke="#10b981" />
            <Line dataKey="spin" stroke="#f59e0b" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* CONTROLS */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setRecording(!recording)}
          className={`px-4 py-2 rounded text-white ${
            recording ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {recording ? "Stop" : "Start"}
        </button>

        <button
          onClick={() => setWifi(!wifi)}
          className={`px-4 py-2 rounded text-white ${
            wifi ? "bg-green-600" : "bg-gray-500"
          }`}
        >
          WiFi
        </button>

        <button
          onClick={() => setBluetooth(!bluetooth)}
          className={`px-4 py-2 rounded text-white ${
            bluetooth ? "bg-blue-600" : "bg-gray-500"
          }`}
        >
          Bluetooth
        </button>

        <button
          onClick={saveSession}
          className="px-4 py-2 rounded bg-green-600 text-white"
        >
          Save Session
        </button>
      </div>
    </div>
  );
}