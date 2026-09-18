import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { classifyForce, getFootballAnimParams } from "../../utils/sensorUtils";

const LEVEL_LABEL = { high: "Heavy contact", medium: "Firm contact", low: "Light contact" };

/**
 * The last strike, felt rather than read: the ball reacts when a real
 * reading arrives, scaled by the force of that strike.
 *
 * It used to be clickable, firing a fake impact animation with no reading
 * behind it. Decoration that pretends to be data is worse than no
 * decoration, so the click is gone — this only ever moves for a real kick.
 */
export default function FootballAnimation({ kickForce = 0 }) {
  const reduceMotion = useReducedMotion();
  const [impacting, setImpacting] = useState(false);
  const prevForce = useRef(0);

  const level = classifyForce(kickForce);
  const params = getFootballAnimParams(kickForce || 200);

  useEffect(() => {
    if (kickForce > 0 && kickForce !== prevForce.current) {
      prevForce.current = kickForce;
      if (reduceMotion) return undefined;
      setImpacting(true);
      const t = setTimeout(() => setImpacting(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [kickForce, reduceMotion]);

  return (
    <section className="panel flex flex-col items-center justify-center p-6" aria-label="Last strike">
      <div className="flex w-full items-center justify-between">
        <h2 className="font-display text-sm font-semibold">Last strike</h2>
        <span className="chip bg-secondary text-muted-foreground">
          {kickForce > 0 ? LEVEL_LABEL[level] : "Waiting"}
        </span>
      </div>

      <div className="relative flex h-28 w-28 items-center justify-center">
        <AnimatePresence>
          {impacting && (
            <motion.span
              key="ring"
              aria-hidden="true"
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border border-primary/60"
            />
          )}
        </AnimatePresence>

        <motion.span
          animate={impacting ? { scale: params.scale } : { scale: 1 }}
          transition={{ duration: params.duration, ease: "easeInOut" }}
          className="select-none text-6xl"
          aria-hidden="true"
        >
          ⚽
        </motion.span>
      </div>

      <p className="font-data text-sm tabular-nums text-muted-foreground">
        {kickForce > 0 ? (
          <>
            <span className="text-foreground">{kickForce}</span> g peak
          </>
        ) : (
          "No reading yet"
        )}
      </p>
    </section>
  );
}
