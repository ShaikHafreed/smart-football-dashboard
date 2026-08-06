"""
Synthetic shot-quality dataset generator.

WHY SYNTHETIC: the project is at TRL 5-6 (working prototype, not yet
field-tested with real players -- see the deck's TRL slide). There is no
real labeled shot-quality dataset yet, because that requires exactly the
field pilot this project hasn't run. Rather than either (a) claiming
results the project doesn't have, or (b) shipping no AI component at all,
this generates a dataset with a documented, physically-motivated labeling
rule, so the model and its evaluation metrics are real -- just trained on
simulated data pending real field collection. This should be replaced
with real football_shots data (with real coach-assigned quality labels)
the moment a field pilot produces enough of it.

Feature ranges match backend/server.py's SENSOR_BOUNDS exactly, not
invented units -- these are the same uncalibrated sensor indices the
firmware actually produces (see Smart-Football-AI-Sensor-Formulas.docx:
the formulas are documented as indices, not calibrated physical units).
"""
import numpy as np
import pandas as pd

# Mirrors backend/server.py SENSOR_BOUNDS. Kept as a literal copy rather
# than a cross-package import so this module has zero dependency on the
# Flask backend -- the ML pipeline can run standalone.
SENSOR_BOUNDS = {
    "speed": (0, 200),
    "spin": (0, 3000),
    "force": (0, 2000),
    "distance": (0, 150),
}

# A "controlled" strike is assumed to land near the middle of the spin
# range, not at either extreme -- too little spin reads as a flat,
# uncurled strike; too much reads as a mishit that imparted more spin
# than intended. This is a stated modeling assumption, not a measured
# fact, and should be revisited once real coach-labeled data exists.
TARGET_SPIN = 1200

QUALITY_LABELS = ["Needs Work", "Solid", "Excellent"]


def _clip01(x):
    return np.clip(x, 0, 1)


def generate(n_samples=3000, seed=42, noise_std=0.12):
    """Returns (X, y) -- X is a DataFrame of the 4 raw sensor features,
    y is the quality label string. The composite quality score behind y
    is NOT one of the returned features -- the model has to learn it
    from the 4 raw values alone, same as it would from a real reading."""
    rng = np.random.default_rng(seed)

    speed = rng.uniform(*SENSOR_BOUNDS["speed"], n_samples)
    spin = rng.uniform(*SENSOR_BOUNDS["spin"], n_samples)
    force = rng.uniform(*SENSOR_BOUNDS["force"], n_samples)
    distance = rng.uniform(*SENSOR_BOUNDS["distance"], n_samples)

    power_score = speed / SENSOR_BOUNDS["speed"][1]
    control_score = _clip01(1 - np.abs(spin - TARGET_SPIN) / TARGET_SPIN)
    # A well-struck shot's force and distance should scale together --
    # high force with low distance (or the reverse) suggests a mishit
    # that didn't transfer energy efficiently.
    efficiency_score = _clip01(
        1 - np.abs(force / SENSOR_BOUNDS["force"][1] - distance / SENSOR_BOUNDS["distance"][1])
    )

    noise = rng.normal(0, noise_std, n_samples)
    quality_score = _clip01(0.4 * power_score + 0.3 * control_score + 0.3 * efficiency_score + noise)

    labels = pd.cut(
        quality_score,
        bins=[-0.01, 0.40, 0.66, 1.01],
        labels=QUALITY_LABELS,
    )

    X = pd.DataFrame({"speed": speed, "spin": spin, "force": force, "distance": distance})
    y = pd.Series(labels, name="quality").astype(str)

    return X, y


def weakest_component(speed, spin, force, distance):
    """Given one reading, name which dimension most needs training focus
    -- this is the 'training optimization' half of the project's own
    title, not just a classification label."""
    power_score = speed / SENSOR_BOUNDS["speed"][1]
    control_score = _clip01(1 - abs(spin - TARGET_SPIN) / TARGET_SPIN)
    efficiency_score = _clip01(
        1 - abs(force / SENSOR_BOUNDS["force"][1] - distance / SENSOR_BOUNDS["distance"][1])
    )

    scores = {"power": power_score, "spin control": control_score, "strike efficiency": efficiency_score}
    weakest = min(scores, key=scores.get)

    recommendations = {
        "power": "Drills focused on plant-foot positioning and hip drive to increase strike speed.",
        "spin control": "Controlled-curve passing drills — the ball is either too flat or over-spun relative to a clean strike.",
        "strike efficiency": "Contact-point drills — force and distance aren't scaling together, suggesting inconsistent contact quality.",
    }
    return weakest, recommendations[weakest]


if __name__ == "__main__":
    X, y = generate()
    print(X.describe())
    print()
    print(y.value_counts())
