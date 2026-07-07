import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import ChartErrorBoundary from "../ChartErrorBoundary";

const TABS = ["Force", "Speed", "Spin"];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function PerformanceChart({ history = [] }) {
  const [activeTab, setActiveTab] = useState("Force");

  // Build chart data from history or fall back to empty state
  const chartData = history.length > 0
    ? history.map((h) => ({
        time: h.time,
        Force: h.kickForce,
        Speed: h.ballSpeed,
        Spin: Math.round(h.spinRate / 10), // scale for display
      }))
    : [];

  const dataKey = activeTab;
  const colors = { Force: "hsl(217,91%,60%)", Speed: "hsl(160,60%,45%)", Spin: "hsl(30,80%,55%)" };
  const gradIds = { Force: "gradForce", Speed: "gradSpeed", Spin: "gradSpin" };
  const color = colors[activeTab];
  const gradId = gradIds[activeTab];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card rounded-xl border border-border p-6 shadow-sm h-full"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Live Performance Trend</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last {history.length || 0} readings</p>
        </div>
        <div className="flex bg-secondary rounded-lg p-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="h-52">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="text-3xl mb-2">📡</div>
            <p className="text-sm">Waiting for sensor data…</p>
          </div>
        ) : (
          <ChartErrorBoundary>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(220,10%,70%)" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220,10%,70%)" />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  fill={`url(#${gradId})`}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: color }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartErrorBoundary>
        )}
      </div>
    </motion.div>
  );
}