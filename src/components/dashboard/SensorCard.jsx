import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Count-up so a changing reading reads as movement, not a jump cut. */
function useCountUp(target, duration = 600, enabled = true) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(null);
  const startRef = useRef(target);

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      return undefined;
    }

    const start = startRef.current;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(start + (target - start) * ease);
      setDisplay(next);
      startRef.current = next;
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, enabled]);

  return display;
}

/**
 * One live measurement. Sits inside a `.hairline-grid`, so it is a cell
 * rather than a floating card — four of these read as one instrument
 * panel instead of four competing boxes.
 */
export default function SensorCard({ icon, label, value, unit, accentClass = "text-foreground", live = false }) {
  const reduceMotion = useReducedMotion();
  const displayed = useCountUp(value ?? 0, 600, !reduceMotion);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value && value > 0) {
      prevRef.current = value;
      if (reduceMotion) return undefined;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      return () => clearTimeout(t);
    }
    prevRef.current = value;
    return undefined;
  }, [value, reduceMotion]);

  return (
    <div className={`relative p-5 transition-colors ${flash ? "bg-primary/[0.06]" : ""}`}>
      <div className="flex items-center justify-between">
        <span aria-hidden="true" className="text-muted-foreground">{icon}</span>
        {/* Only claimed when the device is genuinely reporting — this used
            to read LIVE even with nothing connected. */}
        {live && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Live</span>
          </span>
        )}
      </div>

      <p className={`font-data mt-3 text-3xl font-semibold leading-none tabular-nums ${accentClass}`}>
        {displayed.toLocaleString()}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>
      </p>

      <p className="mt-2 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
