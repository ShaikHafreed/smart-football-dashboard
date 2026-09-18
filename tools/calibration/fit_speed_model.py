"""
Fit the speed model from real paired measurements - or refuse to.

Input is a CSV with one row per strike, pairing what the ball reported with
what a trusted instrument measured:

    peak_g,reference_kmh,accel_saturated
    3.42,31.5,0
    7.80,58.2,0

`accel_saturated` is optional; when present, saturated rows are dropped,
because a clipped peak is a lower bound and not a measurement.

The fit is ordinary least squares on  v = gain * peak_g + offset.  That is
deliberately the simplest model that could work: if peak acceleration does
not predict ball speed well, the honest outcome is to find that out here
rather than to add terms until the line looks good.

This tool will NOT print coefficients unless the dataset passes the checks
below. A refusal is a result: it means the experiment is not yet good
enough to put a physical unit in front of a player.
"""
import argparse
import csv
import math
import sys

# Acceptance thresholds. These bound what may be called a calibration; they
# are not tuned to make any particular dataset pass.
MIN_SAMPLES = 30          # fewer strikes cannot characterise the spread
MIN_G_RANGE = 3.0         # g between the gentlest and hardest strike
MIN_R_SQUARED = 0.80      # below this, peak_g is not predicting speed
MAX_RELATIVE_RMSE = 0.15  # residual spread vs the span of measured speeds


class Refusal(Exception):
    """The dataset does not support a calibration."""


def read_paired(path):
    """Read paired observations, dropping saturated rows."""
    rows, dropped = [], 0

    with open(path, newline="", encoding="utf-8") as f:
        for record in csv.DictReader(f):
            if str(record.get("accel_saturated", "0")).strip() in ("1", "true", "True"):
                dropped += 1
                continue
            try:
                peak_g = float(record["peak_g"])
                reference = float(record["reference_kmh"])
            except (KeyError, TypeError, ValueError):
                continue
            rows.append((peak_g, reference))

    return rows, dropped


def fit(rows):
    """Least-squares fit plus the numbers needed to judge it."""
    n = len(rows)
    if n < 2:
        raise Refusal("need at least two observations to fit anything")

    xs = [r[0] for r in rows]
    ys = [r[1] for r in rows]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    sxx = sum((x - mean_x) ** 2 for x in xs)
    if sxx == 0:
        raise Refusal("every strike produced the same peak_g - no gradient to fit")

    sxy = sum((x - mean_x) * (y - mean_y) for x, y in rows)
    gain = sxy / sxx
    offset = mean_y - gain * mean_x

    residuals = [y - (gain * x + offset) for x, y in rows]
    ss_res = sum(r * r for r in residuals)
    ss_tot = sum((y - mean_y) ** 2 for y in ys)

    rmse = math.sqrt(ss_res / n)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    speed_span = max(ys) - min(ys)

    return {
        "n": n,
        "gain": gain,
        "offset": offset,
        "rmse": rmse,
        "max_abs_residual": max(abs(r) for r in residuals),
        "r_squared": r_squared,
        "g_range": (min(xs), max(xs)),
        "speed_range": (min(ys), max(ys)),
        "relative_rmse": rmse / speed_span if speed_span > 0 else float("inf"),
    }


def check(result):
    """Everything standing between a dataset and a physical unit."""
    problems = []

    if result["n"] < MIN_SAMPLES:
        problems.append(f"only {result['n']} usable strikes; at least {MIN_SAMPLES} are needed")

    g_low, g_high = result["g_range"]
    if g_high - g_low < MIN_G_RANGE:
        problems.append(
            f"peak_g only spans {g_high - g_low:.2f} g ({g_low:.2f}-{g_high:.2f}); "
            f"at least {MIN_G_RANGE} g is needed, so strike from gentle to maximum"
        )

    if result["r_squared"] < MIN_R_SQUARED:
        problems.append(
            f"R^2 is {result['r_squared']:.3f}, below {MIN_R_SQUARED}: peak acceleration alone "
            "does not predict speed here. The model needs more features (contact duration, "
            "impulse) - not a nudged coefficient"
        )

    if result["relative_rmse"] > MAX_RELATIVE_RMSE:
        problems.append(
            f"residual spread is {result['relative_rmse'] * 100:.1f}% of the measured speed range, "
            f"above {MAX_RELATIVE_RMSE * 100:.0f}%"
        )

    return problems


def report(result, problems, dropped):
    print("Speed model fit")
    print("=" * 52)
    print(f"  usable strikes      {result['n']}")
    if dropped:
        print(f"  dropped (saturated) {dropped}")
    print(f"  peak_g range        {result['g_range'][0]:.2f} - {result['g_range'][1]:.2f} g")
    print(f"  reference range     {result['speed_range'][0]:.1f} - {result['speed_range'][1]:.1f} km/h")
    print()
    print(f"  gain                {result['gain']:.4f} (km/h per g)")
    print(f"  offset              {result['offset']:.4f} km/h")
    print(f"  R^2                 {result['r_squared']:.3f}")
    print(f"  RMSE                {result['rmse']:.2f} km/h")
    print(f"  worst residual      {result['max_abs_residual']:.2f} km/h")
    print(f"  RMSE / speed span   {result['relative_rmse'] * 100:.1f}%")
    print()

    if problems:
        print("NOT A CALIBRATION - this dataset does not support a physical unit:")
        for problem in problems:
            print(f"  - {problem}")
        print()
        print("Leave SPEED_CALIBRATED at 0. The app keeps showing a speed index,")
        print("which is honest, rather than a number that looks measured and is not.")
        return

    print("Dataset passes. Put these in firmware/smart_football/calibration.h:")
    print()
    print(f"    #define SPEED_CALIBRATED         1")
    print(f"    #define SPEED_MODEL_GAIN         {result['gain']:.4f}f")
    print(f"    #define SPEED_MODEL_OFFSET       {result['offset']:.4f}f")
    print()
    print("Record alongside them, in the commit message and docs/CALIBRATION.md:")
    print(f"    n={result['n']}, R^2={result['r_squared']:.3f}, RMSE={result['rmse']:.2f} km/h,")
    print(f"    valid over {result['g_range'][0]:.2f}-{result['g_range'][1]:.2f} g "
          f"({result['speed_range'][0]:.1f}-{result['speed_range'][1]:.1f} km/h).")
    print("Outside that range the model is extrapolating and has not been tested.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--paired", required=True, help="CSV of peak_g,reference_kmh[,accel_saturated]")
    args = parser.parse_args(argv)

    rows, dropped = read_paired(args.paired)
    if not rows:
        print("No usable rows. Expected columns: peak_g, reference_kmh.", file=sys.stderr)
        return 1

    try:
        result = fit(rows)
    except Refusal as exc:
        print(f"NOT A CALIBRATION: {exc}", file=sys.stderr)
        return 1

    problems = check(result)
    report(result, problems, dropped)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
