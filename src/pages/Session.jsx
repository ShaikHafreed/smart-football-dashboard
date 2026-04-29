import { useState, useEffect } from "react";

export default function Session() {
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_players")) || [];
    setPlayers(stored);
  }, []);

  const generateData = () => {
    const newData = {
      kick: Math.floor(Math.random() * 500),
      speed: Math.floor(Math.random() * 120),
      spin: Math.floor(Math.random() * 3000),
      time: new Date().toLocaleString(),
    };

    setData(newData);
  };

  const saveSession = () => {
    if (!selected || !data) return;

    const history = JSON.parse(localStorage.getItem("fb_history")) || [];

    history.push({
      player: selected,
      ...data,
    });

    localStorage.setItem("fb_history", JSON.stringify(history));

    alert("Session Saved ✅");
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Session Recorder</h1>

      {/* Select Player */}
      <select
        onChange={(e) => setSelected(e.target.value)}
        className="border p-2 rounded"
      >
        <option>Select Player</option>
        {players.map((p, i) => (
          <option key={i}>{p.name}</option>
        ))}
      </select>

      {/* Generate */}
      <button
        onClick={generateData}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Record Kick ⚽
      </button>

      {/* Data */}
      {data && (
        <div className="bg-white p-4 rounded-xl shadow">
          <p>Kick: {data.kick}</p>
          <p>Speed: {data.speed}</p>
          <p>Spin: {data.spin}</p>
        </div>
      )}

      {/* Save */}
      {data && (
        <button
          onClick={saveSession}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save Session
        </button>
      )}
    </div>
  );
}