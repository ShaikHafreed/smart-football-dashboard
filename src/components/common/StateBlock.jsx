import { Loader2 } from "lucide-react";

/**
 * The three states every data screen needs and most of them were missing:
 * loading, empty, and failed. One component so they look the same
 * everywhere and none of them is an unexplained blank area.
 */
export default function StateBlock({ variant = "empty", icon: Icon, title, message, action, className = "" }) {
  if (variant === "loading") {
    return (
      <div role="status" className={`flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground ${className}`}>
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {title || "Loading…"}
      </div>
    );
  }

  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : undefined}
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center
        ${isError ? "border-destructive/40 bg-destructive/5" : "border-border bg-card/40"} ${className}`}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={`h-6 w-6 ${isError ? "text-destructive" : "text-muted-foreground"}`}
        />
      )}
      {title && (
        <p className={`font-display text-base font-semibold ${isError ? "text-destructive" : "text-foreground"}`}>
          {title}
        </p>
      )}
      {message && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
