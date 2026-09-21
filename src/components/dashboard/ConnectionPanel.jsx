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

/**
 * "Nothing is arriving" had one explanation on screen and two in reality: the
 * ball is not sending, or the relay that accepts readings is not answering.
 * They need opposite responses - check the ball, versus wait or get the
 * service back - and the panel could not tell them apart.
 *
 * Relay state is a separate, independently observed fact, so it is shown as
 * one. Nothing here is inferred from the other: each line reports something
 * actually checked.
 */
const RELAY = {
  checking: { label: "Checking relay…", detail: "Asking the relay whether it's awake." },
  waiting: {
    label: "Still waiting on the relay",
    detail: "The relay sleeps when idle and can take up to a minute to answer. Readings can't arrive until it does.",
  },
  unreachable: {
    label: "Relay unreachable",
    detail: "The ball may be fine — the service that accepts its readings isn't answering.",
  },
  misconfigured: {
    label: "No relay configured",
    detail: "This deployment has no backend URL set, so readings have nowhere to arrive.",
  },
};

/** How long ago, in the coarse terms that are actually useful here. */
function freshness(iso) {
  if (!iso) return null;
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ConnectionPanel({ status = "disconnected", lastReadingAt, relay = "ok", onReconnect }) {
  const since = freshness(lastReadingAt);
  const cfg = STATUS[status] || STATUS.disconnected;
  const isConnected = status === "connected";
  // Only worth saying while nothing is arriving: once readings are coming in,
  // the relay is demonstrably up and repeating that adds noise.
  const relayNote = !isConnected ? RELAY[relay] : null;

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

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {relayNote ? relayNote.detail : cfg.detail}
      </p>

      {relayNote && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${relay === "checking" || relay === "waiting" ? "bg-muted-foreground motion-safe:animate-pulse" : "bg-destructive"}`}
          />
          {relayNote.label}
        </p>
      )}

      {/* Stale numbers on screen are worse than no numbers, so say plainly
          how old the one being shown is. */}
      <p className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">Last reading</span>
        <span className={`font-data tabular-nums ${isConnected ? "text-foreground" : "text-muted-foreground"}`}>
          {since || "none yet"}
        </span>
      </p>

      {!isConnected && (
        <button
          onClick={onReconnect}
          disabled={relay === "checking"}
          className="btn btn-quiet btn-sm mt-4 w-full"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {relay === "checking" ? "Checking…" : "Check again"}
        </button>
      )}
    </section>
  );
}
