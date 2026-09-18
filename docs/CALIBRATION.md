# Calibrating the smart football

Everything here is an experiment someone has to actually run. Nothing in
this repository has been calibrated: the coefficients in
[`firmware/smart_football/calibration.h`](../firmware/smart_football/calibration.h)
are zero and the flags are off, deliberately.

The rule this follows: **a raw sensor count multiplied by a made-up number
is not a measurement.** A quantity stays an index until an experiment says
otherwise, and the app labels it as an index while it is one.

---

## 0. Before you start — a blocker on this machine

The sketch includes `<MPU6050.h>`, and that library **is not installed**.
The Arduino IDE and the ESP32 core are present, but the sketch will not
compile until you add:

* **MPU6050** by Electronic Cats (or jrowberg's I2Cdevlib MPU6050)
* **I2Cdev**, which it depends on

Library Manager → search `MPU6050` → install, then Tools → Board →
ESP32 Dev Module.

You will also need the Wi-Fi file that is deliberately not committed:

```bash
cp firmware/smart_football/secrets.example.h firmware/smart_football/secrets.h
# then fill in your networks
```

**Nobody has compiled this sketch yet.** The first person to build it should
expect to fix small things the static checks cannot catch.

---

## What each experiment establishes

| # | Experiment | Establishes | Equipment |
|---|---|---|---|
| 1 | Rest check | Scaling and mount are sane | None |
| 2 | Turntable | Spin in rpm is correct | Anything rotating at a known rate |
| 3 | Trigger check | The vibration trigger catches real contact | A ball and a foot |
| 4 | Speed reference | Whether speed can become km/h | Radar gun, timing gates, or high-speed video |

Experiments 1–3 verify what the firmware already claims. Only experiment 4
can turn an index into a physical unit.

---

## Capturing data

The firmware prints machine-readable records (`CALIBRATION_LOGGING` is on by
default):

```
CAL_INFO    once at boot   the sensor configuration these numbers came from
CAL_REST    once at boot   1 s of stationary readings
CAL_SPIN    while rotating angular rate, every 250 ms
CAL_IMPACT  per strike     peak g, peak rpm, indices, sample count, saturation
```

Capture them live, or from a log you saved with the IDE's serial monitor:

```bash
pip install pyserial                                    # live capture only
python tools/calibration/capture.py --port COM5 --out data/
python tools/calibration/capture.py --log session.txt --out data/
```

You get `info.csv`, `rest.csv`, `spin.csv` and `impacts.csv`. Ordinary
firmware chatter in the same log is ignored.

---

## Experiment 1 — rest check (5 minutes)

Power the ball on a table and leave it still. At boot it prints:

```
CAL_REST,mean_g=1.0021,min_g=0.9974,max_g=1.0069,samples=196
```

**Pass:** `mean_g` within about 1.00 ± 0.05, and a tight min/max spread.

**If it fails:** the datasheet scaling or the range configuration is wrong,
or the sensor is not rigidly mounted. Stop — every later number depends on
this one. A reading near 8 g suggests the accelerometer is still in a
different full-scale range than the firmware believes.

Repeat with the ball resting on several different faces. All of them should
read ~1 g; gravity does not care about orientation.

---

## Experiment 2 — spin against a turntable

Tape the ball to anything that rotates at a known, steady rate — a record
player (33⅓ or 45 rpm), a drill at a measured speed, a bicycle wheel you
time by hand over 20 revolutions.

While it turns, the ball streams:

```
CAL_SPIN,ms=4250,rpm=33.41,saturated=0
```

**Pass:** the average of the streamed values matches the reference within a
few percent.

**Check the ceiling too.** The gyroscope is configured to ±2000 °/s, which
is **333 rpm**. Spin it faster than that and `saturated=1` should appear and
the reported rate should stop rising. That is the honest failure mode, and
it is worth seeing once so you know what it looks like.

**If the rate is out by a constant factor,** the conversion is wrong, not
the sensor — check `GYRO_LSB_PER_DPS` against the datasheet for the
configured range. This is a datasheet conversion, so it should not need a
fitted coefficient. If one seems necessary, something else is wrong.

---

## Experiment 3 — does the trigger catch the strike?

Kick the ball twenty times, hard and soft, and count how many `CAL_IMPACT`
records appear.

Watch for:

* **Missed kicks.** The trigger is polled, not interrupt-driven, so contact
  between passes is lost. If a meaningful share is missed, that is a
  firmware finding worth recording — the fix is an interrupt, which is out of
  scope until the miss rate is known.
* **`samples`.** Each record says how many sensor reads went into its
  window. A healthy 120 ms window at 400 kHz I²C should be well above
  `IMPACT_MIN_SAMPLES` (10). If it is near the floor, the loop is being
  starved by network work.
* **`accel_saturated=1`.** ±16 g is the widest the part offers. If hard
  strikes routinely saturate, peak g is a lower bound for those strikes and
  they must be excluded from the speed fit — the tooling drops them
  automatically.

---

## Experiment 4 — speed (the one that changes a label)

**This is the only experiment that can turn the speed index into km/h.**

### You need a reference you trust

Any of:

* a **radar gun** (simplest; sports models are adequate)
* **two timing gates** a measured distance apart
* **high-speed video** at a known frame rate, with a metre rule in frame —
  count frames between two known positions

Guessing, or "it felt like about 60", is not a reference. If you do not have
one of these, stop here and leave speed as an index.

### Procedure

1. Set up so the ball is struck across the reference's measurement zone.
2. Take **at least 30 strikes** spanning gentle to maximum power. Spread
   them across the range — thirty identical strikes say nothing about the
   gradient.
3. For each strike record the reference speed, in order, alongside the
   `CAL_IMPACT` line it produced.
4. Build `paired.csv`:

   ```csv
   peak_g,reference_kmh,accel_saturated
   3.42,31.5,0
   7.80,58.2,0
   ```

5. Fit:

   ```bash
   python tools/calibration/fit_speed_model.py --paired paired.csv
   ```

### What the tool will tell you

It fits `v = gain × peak_g + offset` and then judges the dataset. It prints
coefficients **only** if:

| Check | Threshold | Why |
|---|---|---|
| Usable strikes | ≥ 30 | Fewer cannot characterise the spread |
| `peak_g` span | ≥ 3 g | A narrow range fits a gradient it never observed |
| R² | ≥ 0.80 | Below this, peak g is not predicting speed |
| RMSE ÷ speed span | ≤ 15% | The error must be small against what you measured |

If it refuses, that is a result — record it. The likely meaning is that peak
acceleration alone is not enough, and the model needs contact duration or
impulse rather than a nudged coefficient. **Do not lower the thresholds to
make a dataset pass.**

### If it passes

Paste the emitted `#define` lines into `calibration.h`, and record
underneath them — and in this file — the sample count, R², RMSE and the g
and speed range the fit covers. Outside that range the model is
extrapolating and has not been tested.

Setting `SPEED_CALIBRATED` to 1 is what makes the app show km/h. The label
changes because the evidence changed, never the other way round.

---

## Force in newtons, and carry distance

**Force** stays in g until two things exist: the ball's mass on a scale, and
evidence that the sensor tracks the ball's centre of mass rather than local
shell flex on the prototype mount. `F = m·a` is arithmetic; the hard part is
the second condition. Then set `BALL_MASS_KG` and `FORCE_NEWTONS_CALIBRATED`.

**Carry distance** is not measurable with this hardware at all. Nothing on
the board observes where the ball lands, and the current value is derived
from the speed index, so it carries no independent information. Measuring it
needs a different instrument (GPS at sufficient update rate, optical
tracking, or a measured pitch and manual logging), or a validated ballistic
model fed by a calibrated launch speed and spin.

---

## Recording results

When an experiment is run, append here: the date, what was measured, the
equipment, and the outcome — including failures. A calibration nobody can
reproduce is not one.

### Log

| Date | Experiment | Outcome |
|---|---|---|
| — | — | Nothing has been run yet. |
