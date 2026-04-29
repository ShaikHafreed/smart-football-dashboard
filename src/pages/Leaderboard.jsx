import { useEffect, useState } from "react";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_players")) || [];

    const ranked = stored.sort((a, b) => {
      const scoreA = a.kick + a.speed + a.spin;
      const scoreB = b.kick + b.speed + b.spin;
      return scoreB - scoreA;
    });

    setPlayers(ranked);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Leaderboard</h1>

      <div className="bg-white rounded-xl shadow p-4">
        {players.map((p, i) => (
          <div
            key={i}
            className="flex justify-between border-b py-2"
          >
            <span>#{i + 1} {p.name}</span>
            <span>{p.kick + p.speed + p.spin}</span>
          </div>
        ))}
      </div>
    </div>
  );
}