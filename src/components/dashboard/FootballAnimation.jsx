import React, { useEffect, useRef, useState } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { classifyForce, getFootballAnimParams } from "../../utils/sensorUtils";

export default function FootballAnimation({ kickForce = 0 }) {
  const spinControls = useAnimation();
  const [impacting, setImpacting] = useState(false);
  const [intensity, setIntensity] = useState("low");
  const prevForce = useRef(0);

  // Continuous spin, speed based on force
  useEffect(() => {
    const level = classifyForce(kickForce);
    const speed = level === "high" ? 1.5 : level === "medium" ? 3 : 5;
    spinControls.start({
      rotate: 360,
      transition: { duration: speed, repeat: Infinity, ease: "linear" },
    });
  }, [kickForce, spinControls]);

  // Trigger impact animation when new force reading arrives
  useEffect(() => {
    if (kickForce > 0 && kickForce !== prevForce.current) {
      prevForce.current = kickForce;
      setIntensity(classifyForce(kickForce));
      setImpacting(true);
      setTimeout(() => setImpacting(false), 700);
    }
  }, [kickForce]);

  const params = getFootballAnimParams(kickForce || 200);

  const ringColors = {
    high:   "border-blue-500/60",
    medium: "border-amber-400/50",
    low:    "border-slate-300/40",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="bg-card rounded-xl border border-border p-6 shadow-sm flex flex-col items-center justify-center min-h-[220px]"
    >
      <div className="flex items-center justify-between w-full mb-4">
        <p className="text-sm font-semibold text-foreground">Live Ball Feed</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
          intensity === "high"   ? "bg-blue-100 text-blue-700" :
          intensity === "medium" ? "bg-amber-100 text-amber-700" :
                                   "bg-slate-100 text-slate-600"
        }`}>
          {intensity} impact
        </span>
      </div>

      <div className="relative flex items-center justify-center w-32 h-32">
        {/* Impact ripple rings */}
        <AnimatePresence>
          {impacting && (
            <>
              <motion.div
                key="ring1"
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 2.8, opacity: 0 }}
                exit={{}}
                transition={{ duration: 0.65, ease: "easeOut" }}
                className={`absolute inset-0 rounded-full border-2 ${ringColors[intensity]}`}
              />
              <motion.div
                key="ring2"
                initial={{ scale: 0.6, opacity: 0.6 }}
                animate={{ scale: 2.0, opacity: 0 }}
                exit={{}}
                transition={{ duration: 0.55, ease: "easeOut", delay: 0.1 }}
                className={`absolute inset-0 rounded-full border ${ringColors[intensity]}`}
              />
            </>
          )}
        </AnimatePresence>

        {/* Football */}
        <motion.div
          animate={spinControls}
          className="cursor-pointer select-none"
          onClick={() => {
            setImpacting(true);
            setTimeout(() => setImpacting(false), 700);
          }}
        >
          <motion.span
            animate={impacting ? { scale: params.scale } : { scale: 1 }}
            transition={{ duration: params.duration, ease: "easeInOut" }}
            className="text-6xl block"
          >
            ⚽
          </motion.span>
        </motion.div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Force: <span className="font-semibold text-foreground">{kickForce} N</span>
      </p>
    </motion.div>
  );
}