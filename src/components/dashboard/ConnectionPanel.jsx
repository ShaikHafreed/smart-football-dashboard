import React from "react";
import { motion } from "framer-motion";
import { Wifi, Bluetooth, Zap, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";

const STATUS_CONFIG = {
  connected:    { label: "Connected",    dot: "bg-green-400",  text: "text-green-600",  bg: "bg-green-50 border-green-200"  },
  mock:         { label: "Simulation",   dot: "bg-amber-400",  text: "text-amber-600",  bg: "bg-amber-50 border-amber-200"  },
  connecting:   { label: "Connecting…",  dot: "bg-blue-400",   text: "text-blue-600",   bg: "bg-blue-50 border-blue-200"    },
  disconnected: { label: "Disconnected", dot: "bg-slate-300",  text: "text-slate-500",  bg: "bg-slate-50 border-slate-200"  },
  error:        { label: "Error",        dot: "bg-red-400",    text: "text-red-600",    bg: "bg-red-50 border-red-200"      },
};

export default function ConnectionPanel({ status = "disconnected", onReconnect }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-card rounded-xl border border-border p-5 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">ESP32 Sensor</h3>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.text}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "connecting" ? "animate-pulse" : ""}`} />
          {cfg.label}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${
          status === "connected" ? "bg-primary/5 border-primary/20" : "bg-secondary border-border"
        }`}>
          <Wifi className={`w-4 h-4 ${status === "connected" ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium">WiFi</span>
        </div>
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${
          status === "mock" ? "bg-amber-50 border-amber-200" : "bg-secondary border-border"
        }`}>
          <Bluetooth className={`w-4 h-4 ${status === "mock" ? "text-amber-600" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium">Bluetooth</span>
        </div>
      </div>

      {(status === "disconnected" || status === "error") && (
        <Button
          onClick={onReconnect}
          size="sm"
          variant="outline"
          className="w-full mt-3 gap-2 rounded-lg"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reconnect
        </Button>
      )}

      {status === "mock" && (
        <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Using simulated data (no ESP32 found)
        </p>
      )}
    </motion.div>
  );
}