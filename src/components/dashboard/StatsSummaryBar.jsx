import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/** Change since the previous kick, per measurement. */
function StatItem({ label, value, unit, prev }) {
  const diff = prev == null ? 0 : value - prev;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const tone = diff > 0 ? "text-primary" : diff < 0 ? "text-warn" : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-4 p-4 sm:flex-col sm:items-start sm:gap-1 sm:p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-1">
        <p className="font-data text-xl font-semibold tabular-nums">
          {value}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
        </p>
        <span className={`flex items-center gap-1 text-xs ${tone}`}>
          <Icon aria-hidden="true" className="h-3 w-3" />
          {diff !== 0 ? Math.abs(Math.round(diff * 10) / 10) : "no change"}
          <span className="sr-only">since the previous kick</span>
        </span>
      </div>
    </div>
  );
}

export default function StatsSummaryBar({ current, previous }) {
  return (
    <div className="hairline-grid grid-cols-1 sm:grid-cols-3" aria-label="Change since the previous kick">
      <StatItem label="Impact" value={current.kickForce} unit="g" prev={previous?.kickForce} />
      <StatItem label="Speed index" value={current.ballSpeed} unit="" prev={previous?.ballSpeed} />
      <StatItem label="Spin" value={current.spinRate} unit="rpm" prev={previous?.spinRate} />
    </div>
  );
}
