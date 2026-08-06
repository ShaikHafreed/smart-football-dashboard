# Shot Quality Model — Proof of Concept

Answers a specific piece of reviewer feedback: the project needed a real
AI/prediction component with real evaluation results, not just sensor
telemetry. This is that component.

## What it does

Given one reading (`speed`, `spin`, `force`, `distance` — the same four
values the firmware already computes and sends), predicts:

1. A **quality tier** — `Needs Work` / `Solid` / `Excellent` — via a
   trained Random Forest classifier.
2. A **weakest-component flag** (`power`, `spin control`, or `strike
   efficiency`) with a specific, actionable training recommendation —
   the "training optimization" half of the project's own title, not
   just a label.

## Honest methodology — read this before citing the numbers anywhere

**The training data is synthetic.** The project is at TRL 5–6 — a
working prototype, not yet field-tested with real players (see the
deck's TRL slide) — so there is no real dataset of shots with
coach-assigned quality labels yet. Claiming results from real field
data would be false.

What this does instead: `dataset.py` generates readings across the same
sensor ranges the real firmware produces (`backend/server.py`'s
`SENSOR_BOUNDS`, copied deliberately rather than imported, so this
pipeline has zero dependency on the Flask backend), and assigns each one
a quality label using a documented, physically-motivated rule — not
random labels:

- **Power** — normalized speed.
- **Control** — how close spin lands to a target "controlled strike"
  band (too little spin reads as flat; too much reads as a mishit).
- **Efficiency** — whether force and distance scale together the way a
  clean strike should (high force with low distance suggests wasted
  energy, not a good hit).

Gaussian noise is added on top so the relationship isn't perfectly
learnable — a real classifier problem, not a lookup table.

**This is a legitimate way to build and evaluate a PoC ahead of data
collection, as long as it's disclosed as synthetic rather than presented
as field results.** It should be replaced with real `football_shots`
data (with real coach-assigned labels) the moment a field pilot produces
enough of it — everything downstream (training, evaluation, the
recommendation logic) is written to work unchanged against a real
dataset with the same four columns.

## Results (most recent run — see `results/metrics.json` for exact numbers)

| | Accuracy | F1 (macro) |
|---|---|---|
| Majority-class baseline | 0.48 | 0.22 |
| Random Forest (this model) | 0.67 | 0.65 |

5-fold cross-validation F1 (macro): 0.632 ± 0.014 — consistent with the
held-out test score, so this isn't a lucky train/test split.

The confusion matrix (`results/confusion_matrix.png`) shows errors
clustering on adjacent classes (`Solid` misread as `Excellent`, not
`Needs Work` misread as `Excellent`) — the signature of a model that
learned a real ordinal relationship in the data, not noise.

Feature importances: speed (41%) and spin (31%) drive most predictions,
force and distance less (15% and 14%) — consistent with how the
labeling rule was built (power weighted highest), which is itself a
sanity check that the model recovered the right structure rather than
finding a spurious shortcut.

## Reproducing this

```bash
cd ml
pip install -r requirements.txt
python train_shot_quality_model.py
```

Regenerates `results/metrics.json`, `results/confusion_matrix.png`, and
`results/shot_quality_model.joblib`. Also runs in CI on every push
(`.github/workflows/ci.yml`) so these numbers are always reproducible
from a clean checkout, not just asserted.

## Integrating this into the live system (not yet done)

The backend doesn't call this model today — it's a standalone,
independently tested PoC. Wiring it in would mean: loading
`shot_quality_model.joblib` in `backend/server.py`, calling
`.predict()` inside `ingest_reading()` alongside the existing formulas,
and adding a `quality_tier` column to `football_shots`. Deliberately
scoped out of this pass so the model's own correctness could be
verified in isolation first.
