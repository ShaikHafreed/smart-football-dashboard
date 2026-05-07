import { useEffect, useState } from "react";

import {
  Wifi,
  Bluetooth,
  Power,
  Zap,
  Activity,
  Clock,
} from "lucide-react";

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

  const [data, setData] = useState({
    speed: 0,
    spin: 0,
    force: 0,
    distance: 0,
    shot: "No Shot",
    connected: false,
  });

  const [kickCount, setKickCount] = useState(0);

  const [chartData, setChartData] = useState([]);

  const [ballPosition, setBallPosition] = useState(0);

  // =========================
  // FETCH API DATA
  // =========================

  useEffect(() => {

    const fetchData = async () => {

      try {

        const response =
          await fetch("http://127.0.0.1:5000/data");

        const result =
          await response.json();

        setData(result);

        // =========================
        // IF CONNECTED
        // =========================

        if (result.connected) {

          setKickCount((prev) => prev + 1);

          setChartData((prev) => [

            ...prev.slice(-14),

            {
              id: prev.length + 1,
              speed: result.speed,
              spin: result.spin,
              force: result.force,
            },
          ]);

          // football movement
          setBallPosition(
            (result.distance / 100) * 80
          );

        }

        // =========================
        // IF DISCONNECTED
        // =========================

        else {

          setData({
            speed: 0,
            spin: 0,
            force: 0,
            distance: 0,
            shot: "Disconnected",
            connected: false,
          });
        }

      } catch (error) {

  console.log("Backend not reachable");

  setData({
    speed: 0,
    spin: 0,
    force: 0,
    distance: 0,
    shot: "Kick Not Detected",
    connected: false,
  });
}
    };

    fetchData();

    const interval =
      setInterval(fetchData, 1000);

    return () => clearInterval(interval);

  }, []);

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      {/* TITLE */}

      <h1 className="text-3xl font-bold mb-8">
        Smart Analytics
      </h1>

      {/* MAIN CARD */}

      <div className="bg-gradient-to-r from-blue-950 to-black rounded-3xl p-8 text-white shadow-2xl">

        {/* TOP */}

        <div className="flex justify-between items-center">

          <div className="flex items-center gap-4">

            <div className="text-6xl">
              ⚽
            </div>

            <h1 className="text-6xl font-bold">
              Smart Football AI
            </h1>

          </div>

          <div className="flex items-center gap-3 text-2xl">

            <div
              className={`w-5 h-5 rounded-full ${
                data.connected
                  ? "bg-green-400"
                  : "bg-red-500"
              }`}
            ></div>

            {
              data.connected
                ? "Hardware Connected"
                : "Hardware Disconnected"
            }

          </div>
        </div>

        {/* BUTTONS */}

        <div className="flex gap-5 mt-8">

          <button className="bg-blue-600 px-8 py-4 rounded-2xl text-2xl flex items-center gap-3">
            <Wifi />
            WiFi
          </button>

          <button className="bg-blue-600 px-8 py-4 rounded-2xl text-2xl flex items-center gap-3">
            <Bluetooth />
            Bluetooth
          </button>

          <button className="bg-red-500 px-8 py-4 rounded-2xl text-2xl flex items-center gap-3">
            <Power />
            Disconnect
          </button>

        </div>

        {/* SHOT */}

        <div className="bg-yellow-400 text-black text-3xl font-bold rounded-2xl px-6 py-5 mt-8">

          ⚡ Shot Type:
          {" "}
          {data.shot}

        </div>

        {/* CARDS */}

        <div className="grid grid-cols-4 gap-6 mt-8">

          {/* SPEED */}

          <div className="bg-gray-800 rounded-3xl p-8 text-center">

            <h2 className="text-3xl">
              Speed
            </h2>

            <p className="text-6xl font-bold mt-5">
              {data.speed}
            </p>

          </div>

          {/* SPIN */}

          <div className="bg-gray-800 rounded-3xl p-8 text-center">

            <h2 className="text-3xl">
              Spin
            </h2>

            <p className="text-6xl font-bold mt-5">
              {data.spin}
            </p>

          </div>

          {/* FORCE */}

          <div className="bg-gray-800 rounded-3xl p-8 text-center">

            <h2 className="text-3xl">
              Force
            </h2>

            <p className="text-6xl font-bold mt-5">
              {data.force}
            </p>

          </div>

          {/* DISTANCE */}

          <div className="bg-gray-800 rounded-3xl p-8 text-center">

            <h2 className="text-3xl">
              Distance
            </h2>

            <p className="text-6xl font-bold mt-5">
              {data.distance}
            </p>

          </div>

        </div>

        {/* EXTRA CARDS */}

        <div className="grid grid-cols-2 gap-6 mt-8">

          {/* TOTAL KICKS */}

          <div className="bg-gray-800 rounded-3xl p-8">

            <div className="flex items-center gap-3 text-3xl">

              <Activity />

              Total Kicks

            </div>

            <h1 className="text-6xl font-bold mt-5">
              {kickCount}
            </h1>

          </div>

          {/* LAST SHOT */}

          <div className="bg-gray-800 rounded-3xl p-8">

            <div className="flex items-center gap-3 text-3xl">

              <Clock />

              Last Kick

            </div>

            <h1 className="text-5xl font-bold mt-5">
              {data.shot}
            </h1>

          </div>

        </div>

        {/* GRAPH */}

        <div className="bg-gray-800 rounded-3xl p-8 mt-8">

          <h1 className="text-4xl font-bold mb-8">
            📊 Live Performance
          </h1>

          <ResponsiveContainer
            width="100%"
            height={400}
          >

            <LineChart data={chartData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="id" />

              <YAxis />

              <Tooltip />

              <Line
                type="monotone"
                dataKey="speed"
                stroke="#22c55e"
                strokeWidth={4}
              />

              <Line
                type="monotone"
                dataKey="spin"
                stroke="#3b82f6"
                strokeWidth={4}
              />

              <Line
                type="monotone"
                dataKey="force"
                stroke="#ef4444"
                strokeWidth={4}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

        {/* FOOTBALL FIELD */}

        <div className="bg-green-700 rounded-3xl mt-8 p-10 relative h-64 overflow-hidden border-4 border-green-400">

          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-white"></div>

          <div
            className="text-7xl absolute transition-all duration-700"
            style={{
              left: `${ballPosition}%`,
              top: "35%",
            }}
          >
            ⚽
          </div>

        </div>

      </div>
    </div>
  );
}