import { useEffect, useState } from "react";

export default function FootballField({ spin }) {
  const [position, setPosition] = useState(10);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!spin) return;

    // 🎯 Kick detection
    if (spin > 1500) {
      setAnimating(true);

      // Move ball based on spin
      const distance = Math.min(spin / 50, 80);

      setPosition((prev) => {
        let newPos = prev + distance;
        if (newPos > 90) newPos = 10; // reset
        return newPos;
      });

      setTimeout(() => setAnimating(false), 600);
    }
  }, [spin]);

  return (
    <div className="bg-green-600 rounded-xl p-6 relative h-60 overflow-hidden">

      {/* FIELD LINES */}
      <div className="absolute inset-0 border-4 border-white rounded-xl"></div>

      {/* CENTER LINE */}
      <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white"></div>

      {/* BALL */}
      <div
        className={`absolute top-1/2 transform -translate-y-1/2 transition-all duration-500 ${
          animating ? "scale-125 shadow-lg" : ""
        }`}
        style={{ left: `${position}%` }}
      >
        ⚽
      </div>

    </div>
  );
}