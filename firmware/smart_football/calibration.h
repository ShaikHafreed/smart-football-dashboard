// Measurement scaling and calibration for the smart football.
//
// This file exists so there is exactly one place that decides what a raw
// sensor count means, and so the difference between a DATASHEET CONVERSION
// and a CALIBRATION is impossible to blur.
//
//   Datasheet conversion  - a fixed, published property of the MPU6050.
//                           Converting counts to g or to degrees per second
//                           needs no experiment; the part is specified.
//
//   Calibration           - a coefficient that can only come from measuring
//                           this ball against a trusted reference. None of
//                           those exist yet, so none are invented here.
//
// Until a calibration is measured, a quantity that depends on one is
// reported as an INDEX and labelled as an index everywhere it is shown.
// Multiplying a raw count by a made-up number does not create a physical
// unit; it only hides that the number means nothing.
#ifndef SMART_FOOTBALL_CALIBRATION_H
#define SMART_FOOTBALL_CALIBRATION_H

// ==========================================
// SENSOR RANGE (datasheet, MPU6050 / InvenSense PS-MPU-6000A-00)
//
// The firmware previously left the MPU6050 at its power-on defaults of
// +/-2 g and +/-250 deg/s. A struck football sees accelerations in the
// hundreds of g and rotation in the thousands of deg/s, so BOTH axes
// saturated on every real kick: the raw value pinned to 32767 and the
// "measurement" was the same number every time, regardless of the strike.
//
// These select the widest ranges the part offers. A very hard strike can
// still saturate them, which is why saturation is detected and reported
// rather than silently clipped.
// ==========================================

#define ACCEL_RANGE_G            16.0f     // +/-16 g  (MPU6050_ACCEL_FS_16)
#define GYRO_RANGE_DPS           2000.0f   // +/-2000 deg/s (MPU6050_GYRO_FS_2000)

// Datasheet sensitivities for the ranges above. Not tunable: these are
// what the part is specified to output.
#define ACCEL_LSB_PER_G          2048.0f   // counts per g at +/-16 g
#define GYRO_LSB_PER_DPS         16.4f     // counts per deg/s at +/-2000 deg/s

// A 16-bit signed axis saturates at 32767. Treat anything close as clipped,
// because the true peak is then unknown and only a lower bound.
#define AXIS_SATURATION_COUNTS   32000

// Highest angular rate the gyro can express, in rpm. Any strike spinning
// faster than this reads as this value, not as its real rate.
#define GYRO_MAX_RPM             (GYRO_RANGE_DPS / 6.0f)   // 2000 deg/s -> 333.3 rpm

// ==========================================
// IMPACT WINDOW
//
// One sample taken at whatever moment the main loop happened to reach the
// sensor is not a measurement of an impact: contact lasts a few
// milliseconds, and the old loop sampled once per ~300 ms pass, after
// network work that can block for seconds. The peak was almost never in
// the sample that got sent.
//
// After the vibration trigger fires, sample continuously for this long and
// keep the peak magnitudes. Short enough not to stall the loop, long
// enough to contain the contact event and the ball leaving the boot.
// ==========================================

#define IMPACT_WINDOW_MS         120
#define IMPACT_MIN_SAMPLES       10        // below this the window is not trusted

// ==========================================
// CALIBRATION - NOT YET MEASURED
//
// Set to 1 only after running the experiments documented at the bottom of
// this file and replacing the placeholder coefficients with measured ones.
// While this is 0 the firmware reports indices, and the app labels them as
// indices. Do not flip this flag to make the UI show physical units.
// ==========================================

#define SPEED_CALIBRATED         0
#define FORCE_NEWTONS_CALIBRATED 0

// Placeholders. Deliberately zero: a wrong coefficient is worse than an
// absent one, because it produces a number that looks like a measurement.
//
// SPEED_MODEL: ball speed is not something an accelerometer measures. It
// would have to be ESTIMATED from the impact, via a relationship of the
// form  v = SPEED_MODEL_GAIN * peak_g + SPEED_MODEL_OFFSET  (km/h), fitted
// against a reference instrument. Until that fit exists, these stay zero
// and speed is reported as an index.
#define SPEED_MODEL_GAIN         0.0f      // (km/h) per g   - UNMEASURED
#define SPEED_MODEL_OFFSET       0.0f      // km/h           - UNMEASURED

// FORCE: F = m*a is only a force on the ball if `a` is the acceleration of
// the ball's centre of mass and the sensor is rigidly coupled to it. The
// sensor sits inside the ball on a prototype mount, so this needs
// verification before the mass below is used for anything.
#define BALL_MASS_KG             0.0f      // kg             - UNMEASURED

// ==========================================
// DERIVED VALUES
// ==========================================

// Full-scale-normalised impact index, 0-100. An index, not a speed: it is
// monotonic in how hard the ball was struck, and that is all it claims.
#define SPEED_INDEX_FULL_SCALE   100.0f

// The distance field carries speed_index * this factor and therefore holds
// NO INFORMATION that the speed index does not already hold. It is kept
// only so the existing API field stays populated, and it is labelled in the
// app as derived rather than measured. Measuring carry distance needs an
// instrument this ball does not have.
//
// The factor is arbitrary - which is exactly why this is an index and not a
// distance. It is set so a full-scale strike (index 100) lands inside the
// relay's accepted range for this field (0-150), rather than being silently
// clamped there and reported as if it were the real value.
#define DERIVED_CARRY_FACTOR     1.5f

// ==========================================
// CALIBRATION PROCEDURE - what would actually have to be done
//
// SPIN (rpm) - NO CALIBRATION NEEDED
//   The gyroscope measures angular rate directly. Counts -> deg/s is the
//   datasheet sensitivity above, and deg/s -> rpm is division by 6. The
//   only caveat is the +/-2000 deg/s ceiling (GYRO_MAX_RPM), which the
//   firmware reports as a saturation flag. Verification, not calibration:
//   spin the ball on a turntable at a known rpm and confirm agreement.
//
// IMPACT (g) - NO CALIBRATION NEEDED, BUT VERIFY
//   Counts -> g is the datasheet sensitivity. Worth verifying the axes
//   against gravity (a stationary ball must read 1.0 g total) and checking
//   the sensor mount does not ring at its own resonance during contact.
//
// SPEED (km/h) - REQUIRES A REFERENCE EXPERIMENT
//   Needed: a trusted speed reference - a radar gun, or two-gate timing,
//   or high-speed video at a known frame rate over a measured distance.
//   Procedure: take 30+ strikes spanning gentle to maximum power, record
//   peak_g from this firmware alongside the reference speed for each, then
//   fit v = gain * peak_g + offset and record the residual spread. Put the
//   fitted numbers in SPEED_MODEL_GAIN / SPEED_MODEL_OFFSET and set
//   SPEED_CALIBRATED to 1. If the residuals are large, peak_g alone is not
//   a sufficient predictor and the model needs more features (contact
//   duration, impulse) rather than a fudged coefficient.
//
// FORCE (N) - REQUIRES MASS AND MOUNT VERIFICATION
//   Needed: the ball's mass on a scale, and evidence that the sensor
//   tracks the ball's centre of mass rather than local shell flex. Then
//   F = m * a with a in m/s^2. Set BALL_MASS_KG and
//   FORCE_NEWTONS_CALIBRATED to 1. Until then the app shows peak
//   acceleration in g, which is what the sensor actually measured.
//
// CARRY DISTANCE (m) - NOT MEASURABLE WITH THIS HARDWARE
//   Nothing on this board observes where the ball lands. It would need a
//   different instrument (GPS with enough update rate, optical tracking,
//   or a measured pitch and manual logging) or a validated ballistic model
//   fed by a calibrated launch speed and spin.
// ==========================================

#endif
