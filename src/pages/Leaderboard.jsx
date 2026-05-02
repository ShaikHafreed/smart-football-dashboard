import { useEffect, useState } from "react";

export default function Leaderboard() {
  const SERVER = "http://127.0.0.1:5000";
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch(`${SERVER}/leaderboard`)
      .then((res) => res.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">🏆 Player Leaderboard</h1>

      {data.map((item, i) => (
        <div key={i} className="p-4 bg-yellow-100 rounded shadow flex justify-between">
          <span>#{i + 1}</span>
          <span>{item.player}</span>
          <span>Score: {item.bestScore.toFixed(1)}</span>
          <span>Shots: {item.totalShots}</span>
        </div>
      ))}
    </div>
  );
}