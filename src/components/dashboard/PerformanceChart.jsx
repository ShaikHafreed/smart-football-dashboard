import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
    <section className="panel flex h-full flex-col p-5 sm:p-6" aria-label="Performance trend">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold">Performance trend</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {history.length ? `Last ${history.length} reading${history.length === 1 ? "" : "s"}` : "No readings yet"}
          </p>
        </div>
        <div role="tablist" aria-label="Measurement" className="flex gap-1 rounded-full border border-border bg-secondary/50 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={activeTab === t}
              onClick={() => setActiveTab(t)}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-medium transition-colors ${
                activeTab === t ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="h-52">
        {chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">No readings yet</p>
            <p className="max-w-xs text-xs leading-relaxed">Kicks appear here as the paired ball reports them.</p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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
    </section>
  );
}