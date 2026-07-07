/**
 * Performance metrics — Smart Football Analytics
 *
 * All composite scoring works off the fields Supabase actually stores per
 * kick (speed, spin, force, distance). There is no raw IMU time-series in
 * this system — the ESP32 firmware sends one already-computed reading per
 * kick — so these are pure aggregations over that data, not signal
 * processing.
 */

// Equal weights by default. Tune here — kept as named constants so the
// formula stays easy to rebalance later without hunting through the UI code.
export const SCORE_WEIGHTS = {
  speed: 1 / 3,
  power: 1 / 3, // derived from `force`
  spinControl: 1 / 3, // derived from `spin`
};

/** Min-max normalize a value to 0–100 against a range. Safe for a zero-width range. */
export function normalize(value, min, max) {
  if (max === min) return value > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Composite "Best Kick" score for one shot, normalized against the other
 * shots in the same session (or whatever comparison set is passed in).
 */
export function compositeScore(shot, comparisonShots, weights = SCORE_WEIGHTS) {
  const speeds = comparisonShots.map((s) => s.speed || 0);
  const forces = comparisonShots.map((s) => s.force || 0);
  const spins = comparisonShots.map((s) => s.spin || 0);

  const normSpeed = normalize(shot.speed || 0, Math.min(...speeds), Math.max(...speeds));
  const normPower = normalize(shot.force || 0, Math.min(...forces), Math.max(...forces));
  const normSpin = normalize(shot.spin || 0, Math.min(...spins), Math.max(...spins));

  return weights.speed * normSpeed + weights.power * normPower + weights.spinControl * normSpin;
}

/** The shot with the highest composite score in a set. */
export function getBestKick(shots, weights = SCORE_WEIGHTS) {
  if (!shots.length) return null;

  let best = shots[0];
  let bestScore = compositeScore(best, shots, weights);

  for (const shot of shots.slice(1)) {
    const score = compositeScore(shot, shots, weights);
    if (score > bestScore) {
      best = shot;
      bestScore = score;
    }
  }

  return { shot: best, score: bestScore };
}

/** The shot with the single highest raw speed value. */
export function getMaxSpeedKick(shots) {
  if (!shots.length) return null;
  return shots.reduce((max, s) => ((s.speed || 0) > (max.speed || 0) ? s : max), shots[0]);
}

/** Summarize a session's shots into the four headline metrics. */
export function summarizeSession(shots, weights = SCORE_WEIGHTS) {
  if (!shots.length) {
    return { bestKick: null, maxSpeedKick: null, bestKickScore: 0, spinAtBestKick: 0, spinAtMaxSpeedKick: 0 };
  }

  const best = getBestKick(shots, weights);
  const maxSpeed = getMaxSpeedKick(shots);

  return {
    bestKick: best.shot,
    bestKickScore: best.score,
    spinAtBestKick: best.shot.spin || 0,
    maxSpeedKick: maxSpeed,
    spinAtMaxSpeedKick: maxSpeed.spin || 0,
  };
}
