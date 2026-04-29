import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** Animated count-up effect for sensor values */
function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(null);
  const startRef = useRef({ val: target, time: null });

  useEffect(() => {
    const start = startRef.current.val;
    const startTime = performance.now();
    startRef.current = { val: display, time: startTime };

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (target - start) * ease));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return display;
}

export default function SensorCard({ icon, label, value, unit, color, accentClass, delay = 0, trend }) {
  const displayed = useCountUp(value ?? 0);
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prevRef.current !== value && value > 0) {
      setFlash(true);
      setTimeout(() => setFlash(false), 500);
      prevRef.current = value;
    }
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`bg-card rounded-xl border p-6 shadow-sm hover:shadow-md transition-all duration-300 ${
        flash ? "border-primary/40 shadow-primary/10" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">LIVE</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground font-medium">{label}</p>

      <div className="flex items-baseline gap-1.5 mt-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={displayed}
            initial={{ opacity: 0.6, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-3xl font-bold ${accentClass || "text-foreground"}`}
          >
            {displayed.toLocaleString()}
          </motion.span>
        </AnimatePresence>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>

      {/* Mini sparkline bar */}
      {trend !== undefined && (
        <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${Math.min((value / trend) * 100, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${color.replace("bg-", "bg-").replace("/10", "")}`}
          />
        </div>
      )}
    </motion.div>
  );
}