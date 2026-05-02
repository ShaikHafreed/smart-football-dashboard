import { useState, useEffect } from "react";

export default function Home() {
  const [mode, setMode] = useState("none");
  const [data, setData] = useState({
    spin: 0,
    speed: 0,
    force: 0,
    distance: 0,
  });

  const SERVER_URL = "http://192.168.29.254:5000";

  // 🔄 Check connection status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER_URL}/status`);
        const json = await res.json();
        setMode(json.mode);
      } catch (err) {
        console.log("Status error");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // 🔄 Fetch data ONLY when connected
  useEffect(() => {
    if (mode === "none") {
      // reset values when disconnected
      setData({
        spin: 0,
        speed: 0,
        force: 0,
        distance: 0,
      });
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER_URL}/data`);
        const json = await res.json();

        setData({
          spin: json.spin || 0,
          speed: json.speed || 0,
          force: json.force || 0,
          distance: json.distance || 0,
        });
      } catch (err) {
        console.log("Data error");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [mode]);

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-3xl font-bold">Home ⚽</h1>

      {/* CONNECTION STATUS */}
      <div className="text-lg font-semibold">
        Status:{" "}
        <span className={mode === "none" ? "text-red-500" : "text-green-600"}>
          {mode === "none" ? "Disconnected ❌" : `Connected (${mode}) ✅`}
        </span>
      </div>

      {/* DATA CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <Card title="Spin" value={mode === "none" ? "--" : data.spin} />
        <Card title="Speed" value={mode === "none" ? "--" : data.speed} />
        <Card title="Force" value={mode === "none" ? "--" : data.force} />
        <Card title="Distance" value={mode === "none" ? "--" : data.distance} />

      </div>

    </div>
  );
}

// 🔹 CARD COMPONENT
function Card({ title, value }) {
  return (
    <div className="p-4 bg-white rounded shadow text-center">
      <p className="text-gray-500">{title}</p>
      <h2 className="text-xl font-bold">
        {value}
      </h2>
    </div>
  );
}