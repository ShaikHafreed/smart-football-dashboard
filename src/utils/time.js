/** m:ss, for a clock that is ticking in front of someone. */
export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

/**
 * Words rather than a clock, for a duration being read after the fact. "2m 5s"
 * is what someone says about a session they just ran; "2:05" is what they read
 * off one still running.
 */
export function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  if (safe < 60) return `${safe}s`;

  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  if (min < 60) return sec ? `${min}m ${sec}s` : `${min}m`;

  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}
