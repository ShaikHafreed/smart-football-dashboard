import React from "react";
import { motion } from "framer-motion";
import { Zap, Gauge, RotateCcw, ChevronRight } from "lucide-react";
import { Badge } from "../../components/ui/badge";

export default function PlayerCard({ player, index, onClick, selected }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      onClick={() => onClick?.(player)}
      className={`bg-card rounded-xl border p-5 shadow-sm cursor-pointer transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/30 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-bold text-primary">
            {player.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">{player.name}</h3>
            <p className="text-xs text-muted-foreground">
              {player.age ? `Age ${player.age}` : "—"}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="capitalize text-xs">
          {player.role || "player"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-secondary/60 rounded-lg">
          <Zap className="w-3.5 h-3.5 text-primary mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{player.kick_force ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">N</p>
        </div>
        <div className="text-center p-2 bg-secondary/60 rounded-lg">
          <Gauge className="w-3.5 h-3.5 text-chart-2 mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{player.ball_speed ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">km/h</p>
        </div>
        <div className="text-center p-2 bg-secondary/60 rounded-lg">
          <RotateCcw className="w-3.5 h-3.5 text-chart-3 mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{player.spin_rate ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">RPM</p>
        </div>
      </div>

      {selected && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-1.5 text-xs text-primary font-medium">
          <ChevronRight className="w-3.5 h-3.5" />
          Selected for comparison
        </div>
      )}
    </motion.div>
  );
}