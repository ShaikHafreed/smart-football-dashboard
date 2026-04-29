import { useState, useEffect } from "react";

export function useWebSocket() {
  const [sensors, setSensors] = useState({
    kickForce: 0,
    ballSpeed: 0,
    spinRate: 0,
  });

  const [status, setStatus] = useState("connected");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const data = {
        kickForce: Math.floor(Math.random() * 500),
        ballSpeed: Math.floor(Math.random() * 120),
        spinRate: Math.floor(Math.random() * 3000),
        time: new Date().toLocaleTimeString(),
      };

      setSensors(data);
      setHistory((prev) => [...prev.slice(-19), data]);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return { sensors, status, history };
}