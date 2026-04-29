import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";

export default function Compare() {
  const [players, setPlayers] = useState([]);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_players")) || [];
    setPlayers(stored);
  }, []);

  const player1 = players.find((p) => p.name === p1);
  const player2 = players.find((p) => p.name === p2);

  const chartData =
    player1 && player2
      ? [
          { stat: "Kick", A: player1.kick, B: player2.kick },
          { stat: "Speed", A: player1.speed, B: player2.speed },
          { stat: "Spin", A: player1.spin, B: player2.spin },
        ]
      : [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Compare Players</h1>

      {/* SELECT */}
      <div className="flex gap-4">
        <select onChange={(e) => setP1(e.target.value)} className="border p-2 rounded">
          <option>Player 1</option>
          {players.map((p, i) => (
            <option key={i}>{p.name}</option>
          ))}
        </select>

        <select onChange={(e) => setP2(e.target.value)} className="border p-2 rounded">
          <option>Player 2</option>
          {players.map((p, i) => (
            <option key={i}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* RADAR CHART */}
      {player1 && player2 && (
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="mb-4 font-semibold text-lg">Radar Comparison</h2>

          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={chartData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="stat" />
              <Radar name={player1.name} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
              <Radar name={player2.name} dataKey="B" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}