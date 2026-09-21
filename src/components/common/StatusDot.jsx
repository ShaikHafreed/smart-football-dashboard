/**
 * One dot, one meaning.
 *
 * The session screen, the connection panel, the history header and the
 * leaderboard were each drawing their own small coloured circle, with their
 * own size and their own idea of when it should move. A pulsing dot ended up
 * meaning "live data" in one place and "we are still loading" in another,
 * which is the kind of inconsistency that quietly costs trust in a screen full
 * of numbers.
 *
 * Here the halo is reserved for genuinely live data, so a moving dot always
 * means the same thing, and it stops moving for anyone who asked for reduced
 * motion — the colour and the adjacent label carry the state regardless.
 */
export default function StatusDot({ tone = "idle", pulse = false, className = "" }) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      data-pulse={pulse ? "true" : undefined}
      className={`status-dot motion-reduce:animate-none ${className}`}
    />
  );
}
