import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function PlayerAnalytics() {
  const { name } = useParams();

  const [sessions, setSessions] = useState([]);
  const [avg, setAvg] = useState({ kick: 0, speed: 0, spin: 0 });
  const [score, setScore] = useState(0);

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem("fb_history")) || [];

    const playerSessions = history.filter((h) => h.player === name);

    setSessions(playerSessions);

    let totalKick = 0;
    let totalSpeed = 0;
    let totalSpin = 0;
    let count = 0;

    playerSessions.forEach((s) => {
      const last = s.data?.[s.data.length - 1];
      if (last) {
        totalKick += last.kick;
        totalSpeed += last.speed;
        totalSpin += last.spin;
        count++;
      }
    });

    if (count > 0) {
      const avgKick = Math.round(totalKick / count);
      const avgSpeed = Math.round(totalSpeed / count);
      const avgSpin = Math.round(totalSpin / count);

      setAvg({
        kick: avgKick,
        speed: avgSpeed,
        spin: avgSpin,
      });

      // 🎯 PERFORMANCE SCORE (simple formula)
      const calculatedScore = Math.round(
        (avgKick / 5 + avgSpeed * 2 + avgSpin / 50) / 3
      );

      setScore(calculatedScore);
    }
  }, [name]);

  // BEST STAT
  const bestStat =
    avg.kick > avg.speed && avg.kick > avg.spin
      ? "Kick"
      : avg.speed > avg.spin
      ? "Speed"
      : "Spin";

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-3xl font-bold dark:text-white">
        {name} Analytics
      </h1>

      {/* SCORE CARD */}
      <div className="bg-blue-600 text-white p-6 rounded-xl shadow text-center">
        <p className="text-sm opacity-80">Performance Score</p>
        <h2 className="text-4xl font-bold">{score}/100</h2>
      </div>

      {/* AVG STATS */}
      <div className="grid md:grid-cols-3 gap-4">

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <p>Avg Kick</p>
          <h2 className="text-xl font-bold">{avg.kick}</h2>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <p>Avg Speed</p>
          <h2 className="text-xl font-bold">{avg.speed}</h2>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded shadow">
          <p>Avg Spin</p>
          <h2 className="text-xl font-bold">{avg.spin}</h2>
        </div>

      </div>

      {/* BEST STAT */}
      <div className="bg-green-600 text-white p-4 rounded text-center">
        Best Skill: {bestStat}
      </div>

      {/* GRAPH */}
      {sessions.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-5 rounded shadow">
          <h3 className="mb-3 font-semibold">Performance Trend</h3>

          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={sessions.map((s) => s.data?.[s.data.length - 1])}
            >
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />

              <Line dataKey="kick" stroke="#3b82f6" />
              <Line dataKey="speed" stroke="#10b981" />
              <Line dataKey="spin" stroke="#f59e0b" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SESSION LIST */}
      <div className="space-y-3">
        {sessions.map((s, i) => {
          const last = s.data?.[s.data.length - 1];

          return (
            <div
              key={i}
              className="bg-white dark:bg-slate-800 p-4 rounded shadow"
            >
              <p className="font-semibold">{s.time}</p>
              <p>Kick: {last?.kick}</p>
              <p>Speed: {last?.speed}</p>
              <p>Spin: {last?.spin}</p>
            </div>
          );
        })}
      </div>

    </div>
  );
}