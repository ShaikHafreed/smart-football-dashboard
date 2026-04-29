/**
 * Sensor utility helpers — Smart Football Analytics
 * Pure functions for classifying and formatting sensor values.
 */

/** Classify kick force into intensity level */
export function classifyForce(force) {
  if (force >= 450) return "high";
  if (force >= 280) return "medium";
  return "low";
}

/** Get animation params based on force level */
export function getFootballAnimParams(force) {
  const level = classifyForce(force);
  return {
    high:   { scale: [1, 1.45, 0.88, 1.18, 1], duration: 0.45 },
    medium: { scale: [1, 1.18, 0.95, 1.06, 1], duration: 0.55 },
    low:    { scale: [1, 1.06, 0.98, 1.02, 1], duration: 0.7 },
  }[level];
}

/** Format numbers with locale separators */
export function fmt(val) {
  return typeof val === "number" ? val.toLocaleString() : "—";
}

/** Get color class for a value relative to a max */
export function getValueColor(value, max) {
  const pct = value / max;
  if (pct > 0.75) return "text-blue-600";
  if (pct > 0.45) return "text-amber-500";
  return "text-muted-foreground";
}