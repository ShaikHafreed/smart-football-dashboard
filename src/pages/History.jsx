import { useEffect, useState } from "react";

export default function History() {
  const SERVER = "http://127.0.0.1:5000";
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch(`${SERVER}/history`)
      .then((res) => res.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">📜 Shot History</h1>

      {data.map((item, i) => (
        <div key={i} className="p-4 bg-white rounded-xl shadow flex justify-between">
          <span>Speed: {item.speed}</span>
          <span>Spin: {item.spin}</span>
          <span>Distance: {item.distance}</span>
        </div>
      ))}
    </div>
  );
}