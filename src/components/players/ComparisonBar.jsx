import React from "react";
import { motion } from "framer-motion";

function MetricRow({ label, unit, a, b, nameA, nameB }) {
  const maxVal = Math.max(a ?? 0, b ?? 0, 1);
  const pctA = ((a ?? 0) / maxVal) * 100;
  const pctB = ((b ?? 0) / maxVal) * 100;
  const aWins = (a ?? 0) >= (b ?? 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="space-y-1.5">
        {/* Player A bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground font-medium w-20 truncate">{nameA}</span>
          <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pctA}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${aWins ? "bg-primary" : "bg-slate-300"}`}
            />
          </div>
          <span className={`text-xs font-bold w-10 text-right ${aWins ? "text-primary" : "text-muted-foreground"}`}>
            {a ?? "—"}
          </span>
        </div>
        {/* Player B bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground font-medium w-20 truncate">{nameB}</span>
          <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pctB}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className={`h-full rounded-full ${!aWins ? "bg-chart-3" : "bg-slate-300"}`}
            />
          </div>
          <span className={`text-xs font-bold w-10 text-right ${!aWins ? "text-chart-3" : "text-muted-foreground"}`}>
            {b ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ComparisonBar({ playerA, playerB }) {
  if (!playerA || !playerB) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Head-to-Head Comparison</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />{playerA.name}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-chart-3 inline-block" />{playerB.name}</span>
        </div>
      </div>

      <MetricRow label="Kick Force" unit="N"    a={playerA.kick_force} b={playerB.kick_force} nameA={playerA.name} nameB={playerB.name} />
      <MetricRow label="Ball Speed" unit="km/h" a={playerA.ball_speed} b={playerB.ball_speed} nameA={playerA.name} nameB={playerB.name} />
      <MetricRow label="Spin Rate"  unit="RPM"  a={playerA.spin_rate}  b={playerB.spin_rate}  nameA={playerA.name} nameB={playerB.name} />
    </motion.div>
  );
}