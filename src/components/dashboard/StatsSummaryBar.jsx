import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function StatItem({ label, value, unit, prev }) {
  const diff = prev ? value - prev : 0;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color = diff > 0 ? "text-green-500" : diff < 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="flex flex-col items-center gap-0.5 px-6">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-lg font-bold text-foreground">
        {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      <div className={`flex items-center gap-0.5 text-xs ${color}`}>
        <Icon className="w-3 h-3" />
        {diff !== 0 ? Math.abs(diff) : "—"}
      </div>
    </div>
  );
}

export default function StatsSummaryBar({ current, previous }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border shadow-sm flex flex-wrap divide-x divide-border overflow-hidden"
    >
      <StatItem label="Kick Force" value={current.kickForce} unit="N"    prev={previous?.kickForce} />
      <StatItem label="Ball Speed" value={current.ballSpeed} unit="km/h" prev={previous?.ballSpeed} />
      <StatItem label="Spin Rate"  value={current.spinRate}  unit="RPM"  prev={previous?.spinRate}  />
    </motion.div>
  );
}