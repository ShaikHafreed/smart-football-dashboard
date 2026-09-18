import { RadioTower, RefreshCw, WifiOff } from "lucide-react";

/**
 * Whether the paired ball is currently reporting.
 *
 * This panel used to advertise a Bluetooth channel and a "Simulation"
 * mode, neither of which exists in this system — the ball reports over
 * Wi-Fi to the relay, and there is no mock data path. It also rendered
 * light-mode chips (bg-green-50, border-slate-200) on a dark surface.
 * Both are fixed: real states only, drawn from the app's own tokens.
 */
const STATUS = {
  connected: {
    label: "Reporting",
    detail: "The ball is sending readings.",
    dot: "bg-primary",
    tone: "border-primary/40 bg-primary/10 text-primary",
  },
  disconnected: {
    label: "Not reporting",
    detail: "No reading in the last few seconds.",
    dot: "bg-muted-foreground",
    tone: "border-border bg-secondary text-muted-foreground",
  },
};

export default function ConnectionPanel({ status = "disconnected", onReconnect }) {
  const cfg = STATUS[status] || STATUS.disconnected;
  const isConnected = status === "connected";

  return (
    <section className="panel flex flex-col p-5" aria-label="Ball connection">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {isConnected ? (
            <RadioTower aria-hidden="true" className="h-4 w-4 text-primary" />
          ) : (
            <WifiOff aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="font-display text-sm font-semibold">Ball</h2>
        </span>

        <span className={`chip ${cfg.tone}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{cfg.detail}</p>

      {!isConnected && (
        <button onClick={onReconnect} className="btn btn-quiet btn-sm mt-4 w-full">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Retry connection
        </button>
      )}
    </section>
  );
}
