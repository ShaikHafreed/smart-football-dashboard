import { useState, useEffect } from "react";

export default function Session() {
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let interval;

    if (running) {
      interval = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [running]);

  const formatTime = () => {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  return (
    <div className="space-y-6">

      <h1 className="text-3xl font-bold">⚡ Session</h1>

      {/* STATUS */}
      <div className={`p-6 rounded-2xl text-center text-xl font-semibold shadow transition
        ${running
          ? "bg-green-100 text-green-700 animate-pulse"
          : "bg-gray-100 text-gray-600"}`}>
        {running ? "Session Running..." : "Session Stopped"}
      </div>

      {/* TIMER */}
      <div className="text-center text-5xl font-bold">
        ⏱️ {formatTime()}
      </div>

      {/* BUTTONS */}
      <div className="flex justify-center gap-6">
        <button
          onClick={() => setRunning(true)}
          className="bg-green-500 text-white px-6 py-3 rounded-xl shadow hover:scale-105 transition"
        >
          ▶ Start
        </button>

        <button
          onClick={() => setRunning(false)}
          className="bg-red-500 text-white px-6 py-3 rounded-xl shadow hover:scale-105 transition"
        >
          ⏹ Stop
        </button>

        <button
          onClick={() => {
            setRunning(false);
            setTime(0);
          }}
          className="bg-gray-500 text-white px-6 py-3 rounded-xl shadow hover:scale-105 transition"
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
}