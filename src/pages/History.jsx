import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function History() {
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_history")) || [];
    setHistory(stored);
  }, []);

  const deleteSession = (index) => {
    const updated = history.filter((_, i) => i !== index);
    localStorage.setItem("fb_history", JSON.stringify(updated));
    setHistory(updated);
    setSelected(null);
  };

  const filteredHistory = filter
    ? history.filter((h) => h.player === filter)
    : history;

  const players = [...new Set(history.map((h) => h.player))];

  return (
    <div className="p-6 space-y-6">
      
      <h1 className="text-3xl font-bold">Session History 📊</h1>

      {/* FILTER */}
      <select
        onChange={(e) => setFilter(e.target.value)}
        className="border p-2 rounded"
      >
        <option value="">All Players</option>
        {players.map((p, i) => (
          <option key={i}>{p}</option>
        ))}
      </select>

      {/* SESSION LIST */}
      <div className="grid md:grid-cols-2 gap-4">
        {filteredHistory.length === 0 ? (
          <p>No sessions found ❌</p>
        ) : (
          filteredHistory.map((session, i) => (
            <div
              key={i}
              className="bg-white p-4 rounded-xl shadow hover:shadow-lg transition"
            >
              <h3 className="font-bold">{session.player}</h3>
              <p className="text-sm text-gray-500">{session.time}</p>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSelected(session)}
                  className="px-3 py-1 bg-blue-600 text-white rounded"
                >
                  View
                </button>

                <button
                  onClick={() => deleteSession(i)}
                  className="px-3 py-1 bg-red-600 text-white rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CHART VIEW */}
      {selected && (
        <div className="bg-white p-5 rounded-xl shadow">
          <h2 className="font-semibold mb-3">
            {selected.player} Performance
          </h2>

          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={selected.data}>
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
    </div>
  );
}