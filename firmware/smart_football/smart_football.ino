#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Wire.h>
#include <MPU6050.h>
#include <Preferences.h>
#include <esp_system.h>   // esp_random() — hardware RNG for the pairing code
#include <time.h>         // NTP-backed clock, required for TLS certificate validation

// Root CAs the backend must chain to. Generated, public, and verified
// against the live host -- see the file header.
#include "certs.h"

// Sensor ranges, datasheet scaling, and the (as yet unmeasured)
// calibration coefficients. Every number that turns a raw count into
// something reportable lives there, not here.
#include "calibration.h"

MPU6050 mpu;
Preferences prefs;

#define FW_VERSION "1.1.0"

// Wi-Fi credentials are NOT stored in this file -- they live in secrets.h,
// which is gitignored. Copy secrets.example.h to secrets.h and fill in your
// own networks before flashing. Tried in order at boot and on reconnect;
// add a venue's network to secrets.h ahead of an event instead of
// reflashing on-site.
#include "secrets.h"

struct WifiNetwork { const char* ssid; const char* password; };
WifiNetwork knownNetworks[] = WIFI_NETWORKS;
const int knownNetworkCount = sizeof(knownNetworks) / sizeof(knownNetworks[0]);

// Public backend host (no scheme, no trailing slash) — this is what makes
// the ball work on ANY Wi-Fi with internet (college, public, mobile
// hotspot), not just the one network its old local-IP address lived on.
const char* serverHost = "smart-football-backend.onrender.com";

// All backend traffic goes over TLS, and the certificate is now actually
// verified against the roots in certs.h. Previously this client ran with
// setInsecure(), which accepted ANY certificate -- so anyone able to answer
// for the backend on a hostile network (a café, a campus, a phone hotspot)
// could read this ball's device token straight out of its first request and
// then write telemetry as it, or serve it their own firmware over OTA.
//
// There is deliberately no insecure fallback: if validation fails the kick
// is buffered, not sent in the clear.
WiFiClientSecure secureClient;

// TLS validation checks the certificate's validity window, and an ESP32
// boots believing it is 1970 -- so without a real clock every request would
// fail as "certificate not yet valid". NTP is a prerequisite here, not a
// nicety, which is why nothing is sent until this is true.
bool timeSynced = false;

#define VIB_PIN 27

// Wire a resistor-divider from the battery to this ADC pin once a battery
// is actually fitted (see Slide 13/22 — LiFePO4, not yet on this
// breadboard build). Left unconnected today on purpose.
#define BATTERY_ADC_PIN 34

int16_t ax, ay, az, gx, gy, gz;

// ==========================================
// MEASUREMENT
//
// What the sensor can honestly report, and what it cannot:
//
//   spin   -> a real physical rate. The gyroscope measures angular
//             velocity; counts to deg/s is the datasheet sensitivity and
//             deg/s to rpm is /6. No calibration required.
//   impact -> real peak acceleration in g, by the same datasheet scaling.
//             NOT newtons: that needs the ball's mass and proof the sensor
//             tracks its centre of mass (see calibration.h).
//   speed  -> an accelerometer does not measure speed. Reported as a
//             full-scale index until the reference experiment in
//             calibration.h has been run.
//   carry  -> not measurable with this hardware at all. The value sent is
//             derived from the speed index purely to keep the existing API
//             field and stored history continuous, and the app labels it
//             as derived.
// ==========================================

struct ImpactMeasurement {
  float peakG;          // peak |acceleration| over the window, in g
  float peakRpm;        // peak |angular rate| over the window, in rpm
  float speedIndex;     // 0-100, full-scale normalised. NOT km/h.
  float derivedCarry;   // speed index * DERIVED_CARRY_FACTOR. No new information.
  bool accelSaturated;  // true peak is only a lower bound
  bool gyroSaturated;
  int samples;
};

bool axisSaturated(int16_t v) {
  return v > AXIS_SATURATION_COUNTS || v < -AXIS_SATURATION_COUNTS;
}

// Samples as fast as the I2C bus allows for IMPACT_WINDOW_MS and keeps the
// peaks. Contact lasts a few milliseconds; a single reading taken whenever
// the main loop happened to arrive almost never contained it.
ImpactMeasurement captureImpact() {
  ImpactMeasurement m = {0, 0, 0, 0, false, false, 0};

  long peakAccelCounts = 0;
  long peakGyroCounts = 0;
  unsigned long start = millis();

  while (millis() - start < IMPACT_WINDOW_MS) {
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
    m.samples++;

    if (axisSaturated(ax) || axisSaturated(ay) || axisSaturated(az)) m.accelSaturated = true;
    if (axisSaturated(gx) || axisSaturated(gy) || axisSaturated(gz)) m.gyroSaturated = true;

    // Magnitude of the whole vector: a kick does not arrive along a
    // convenient axis, and the old code read one axis for "speed" and a
    // different one for "force" as though they were separate quantities.
    long a2 = (long)ax * ax + (long)ay * ay + (long)az * az;
    long g2 = (long)gx * gx + (long)gy * gy + (long)gz * gz;
    if (a2 > peakAccelCounts) peakAccelCounts = a2;
    if (g2 > peakGyroCounts) peakGyroCounts = g2;
  }

  m.peakG = sqrt((double)peakAccelCounts) / ACCEL_LSB_PER_G;
  m.peakRpm = (sqrt((double)peakGyroCounts) / GYRO_LSB_PER_DPS) / 6.0f;

  // An index, explicitly: how hard the strike was as a fraction of what
  // the sensor can express. It becomes a speed only when the experiment in
  // calibration.h has been run.
  m.speedIndex = (m.peakG / ACCEL_RANGE_G) * SPEED_INDEX_FULL_SCALE;
  if (m.speedIndex > SPEED_INDEX_FULL_SCALE) m.speedIndex = SPEED_INDEX_FULL_SCALE;

#if SPEED_CALIBRATED
  m.speedIndex = SPEED_MODEL_GAIN * m.peakG + SPEED_MODEL_OFFSET;   // km/h
#endif

  m.derivedCarry = m.speedIndex * DERIVED_CARRY_FACTOR;
  return m;
}

// ==========================================
// DEVICE IDENTITY (persisted across reboots in NVS)
// ==========================================

String deviceId = "";
String deviceToken = "";

// The pairing code is this board's proof of physical possession. It is
// generated here (never by the server, never shipped in this source), sent
// once at registration — where the backend keeps only a salted hash of it —
// and printed to Serial on every boot. Claiming the ball in the app requires
// typing it, so knowing a device id is no longer enough to take someone's
// football.
String pairingCode = "";

// No 0/O/1/I/5/S: this gets read off a serial monitor and typed by a person.
const char PAIRING_ALPHABET[] = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const int PAIRING_CODE_LENGTH = 8;

String getDeviceUid() {
  uint64_t chipid = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%016llX", (unsigned long long)chipid);
  return String(buf);
}

String generatePairingCode() {
  const int alphabetSize = sizeof(PAIRING_ALPHABET) - 1;
  String code = "";
  for (int i = 0; i < PAIRING_CODE_LENGTH; i++) {
    // esp_random() is the hardware RNG, not the seeded pseudo-random the
    // Arduino random() uses — which would produce the same "secret" on
    // every board that boots the same way.
    code += PAIRING_ALPHABET[esp_random() % alphabetSize];
  }
  return code;
}

void printPairingInstructions() {
  if (deviceId == "" || pairingCode == "") return;
  Serial.println("---------------------------------------------");
  Serial.println("Pair this ball in the app with:");
  Serial.println("  Device ID:    " + deviceId);
  Serial.println("  Pairing code: " + pairingCode);
  Serial.println("---------------------------------------------");
}

// Called when the backend says these credentials are no longer valid (the
// owner released the ball, or it was revoked). Wiping them is what makes the
// board re-register on its next loop and become claimable again by whoever
// is physically holding it.
void clearDeviceCredentials() {
  prefs.remove("device_id");
  prefs.remove("device_token");
  prefs.remove("pairing_code");
  deviceId = "";
  deviceToken = "";
  pairingCode = "";
  Serial.println("Device credentials revoked — will re-register.");
}

// Registers this board with the backend on its very first boot and saves
// the returned credentials to flash (NVS) so it never has to register
// again. If NVS already has credentials, this is skipped entirely.
bool registerDevice() {
  String deviceUid = getDeviceUid();
  Serial.println("Registering device, uid=" + deviceUid);

  // A fresh code every registration, so a re-provisioned ball can never be
  // claimed with a code someone noted down before.
  String newPairingCode = generatePairingCode();

  HTTPClient http;
  String url = String("https://") + serverHost + "/api/device/register";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(60000);

  String payload = String("{\"device_uid\":\"") + deviceUid +
                   "\",\"pairing_code\":\"" + newPairingCode + "\"}";
  int code = http.POST(payload);

  // 200 = this unclaimed identity was re-provisioned (an NVS erase, or a
  // ball that was released by its previous owner); 201 = brand new. Both
  // hand back fresh credentials.
  if (code == 200 || code == 201) {
    String body = http.getString();
    // Minimal hand-rolled parse — the response is a small, fixed-shape
    // object we control on the server side, so a JSON library is overkill.
    int idStart = body.indexOf("\"device_id\":\"") + 14;
    int idEnd = body.indexOf('"', idStart);
    int tokStart = body.indexOf("\"device_token\":\"") + 17;
    int tokEnd = body.indexOf('"', tokStart);

    deviceId = body.substring(idStart, idEnd);
    deviceToken = body.substring(tokStart, tokEnd);
    pairingCode = newPairingCode;

    prefs.putString("device_id", deviceId);
    prefs.putString("device_token", deviceToken);
    // Stored only after the server accepted it — otherwise this board would
    // print a code that claims nothing.
    prefs.putString("pairing_code", pairingCode);

    Serial.println("Registered. device_id=" + deviceId);
    printPairingInstructions();
    http.end();
    return true;
  }

  if (code == 409) {
    // The device_uid exists AND is already claimed by an account. The server
    // will not re-issue credentials for a claimed device (that is what stops
    // anyone who knows a device id from taking it over), so recovery is
    // owner-driven: press Release on the Devices page, which revokes the old
    // credentials and lets this board register itself again.
    Serial.println("This ball is already claimed by an account and its local credentials are missing.");
    Serial.println("Open the app -> Devices -> Release on that ball, then reboot to re-pair it.");
  } else {
    Serial.printf("Registration failed, HTTP %d\n", code);
  }

  http.end();
  return false;
}

// ==========================================
// WIFI
// ==========================================

bool ensureTimeSynced() {
  if (timeSynced) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  configTime(0, 0, "pool.ntp.org", "time.google.com");

  // Any plausible "now" beats the 1970 the chip starts from; this is a
  // sanity floor (2023-11-14), not a precision requirement.
  const time_t MIN_VALID_EPOCH = 1700000000;
  time_t now = time(nullptr);
  unsigned long start = millis();
  while (now < MIN_VALID_EPOCH && millis() - start < 10000) {
    delay(200);
    now = time(nullptr);
  }

  timeSynced = now >= MIN_VALID_EPOCH;
  if (timeSynced) {
    Serial.println("Time synced — HTTPS certificate validation active.");
  } else {
    Serial.println("Time sync failed — retrying; kicks are buffered until certificates can be validated.");
  }
  return timeSynced;
}

void connectWiFi() {
  for (int i = 0; i < knownNetworkCount; i++) {
    Serial.printf("Trying WiFi: %s\n", knownNetworks[i].ssid);
    WiFi.begin(knownNetworks[i].ssid, knownNetworks[i].password);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
      delay(300);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("");
      Serial.println("WiFi connected: " + String(knownNetworks[i].ssid));
      Serial.println(WiFi.localIP());
      return;
    }
    Serial.println(" failed.");
  }
  Serial.println("All known networks failed — will retry next loop.");
}

// ==========================================
// OFFLINE BUFFER
//
// A kick that fails to send is not lost — it's held here and flushed as
// a batch the next time a send succeeds, instead of just vanishing (the
// old behavior) or permanently silencing the device (the old errorState
// latch bug: one failed POST used to disable every future send until a
// reset button that doesn't exist on this hardware was pressed).
// ==========================================

#define BUFFER_CAPACITY 20
struct BufferedReading { float speed, spin, force, distance; };
BufferedReading offlineBuffer[BUFFER_CAPACITY];
int bufferCount = 0;

void bufferReading(float speed, float spin, float force, float distance) {
  if (bufferCount >= BUFFER_CAPACITY) {
    // Buffer full — drop the oldest reading to make room for this one
    // rather than losing the newest data.
    for (int i = 1; i < BUFFER_CAPACITY; i++) offlineBuffer[i - 1] = offlineBuffer[i];
    bufferCount = BUFFER_CAPACITY - 1;
  }
  offlineBuffer[bufferCount++] = {speed, spin, force, distance};
  Serial.printf("Buffered offline (%d queued)\n", bufferCount);
}

int readBatteryPct() {
  // No divider is wired to BATTERY_ADC_PIN on this prototype yet, so an
  // ADC reading here would be floating noise, not a real voltage. Report
  // -1 (unknown) rather than a fabricated number until the battery from
  // Slide 22's BOM is actually fitted with its divider.
  return -1;
}

// ==========================================
// SENDING DATA
// ==========================================

bool sendOne(float speed, float spin, float force, float distance) {
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/data";

  String payload =
    String("{\"device_id\":\"") + deviceId +
    "\",\"device_token\":\"" + deviceToken +
    "\",\"firmware_version\":\"" + FW_VERSION +
    "\",\"wifi_rssi\":" + String(WiFi.RSSI()) +
    ",\"battery_pct\":" + String(readBatteryPct()) +
    ",\"speed\":" + String(speed, 2) +
    ",\"spin\":" + String(spin, 2) +
    ",\"force\":" + String(force, 2) +
    ",\"distance\":" + String(distance, 2) +
    ",\"shot\":\"kick\"}";

  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");
  // Render's free tier sleeps after 15 min idle and can take 30-50s to
  // wake on the first request — give it real room instead of timing out.
  http.setTimeout(60000);

  int responseCode = http.POST(payload);
  http.end();

  Serial.print("Kick sent -> ");
  Serial.println(responseCode);

  if (responseCode == 401) {
    // Only ever returned for credentials the server actively rejected. A
    // Supabase outage or lookup failure returns 503, not 401, precisely so
    // a transient blip can never wipe a working identity.
    clearDeviceCredentials();
    return false;
  }

  return responseCode == 200;
}

void flushBuffer() {
  if (bufferCount == 0) return;

  Serial.printf("Flushing %d buffered reading(s)...\n", bufferCount);
  int sent = 0;
  for (int i = 0; i < bufferCount; i++) {
    if (sendOne(offlineBuffer[i].speed, offlineBuffer[i].spin, offlineBuffer[i].force, offlineBuffer[i].distance)) {
      sent++;
    } else {
      // Stop on first failure — shift the unsent remainder to the front
      // and keep them queued for next time.
      int remaining = bufferCount - i;
      for (int j = 0; j < remaining; j++) offlineBuffer[j] = offlineBuffer[i + j];
      bufferCount = remaining;
      return;
    }
  }
  bufferCount = 0;
}

void sendReading(float speed, float spin, float force, float distance) {
  // No clock means no certificate validation, so this buffers exactly as it
  // does with no Wi-Fi -- the kick is kept, never sent unverified.
  if (WiFi.status() != WL_CONNECTED || !timeSynced || deviceId == "") {
    bufferReading(speed, spin, force, distance);
    return;
  }

  if (sendOne(speed, spin, force, distance)) {
    flushBuffer();
  } else {
    bufferReading(speed, spin, force, distance);
  }
}

// ==========================================
// OTA FIRMWARE UPDATES
//
// Checks backend/firmware_releases/latest.json (served at
// /api/firmware/version) once an hour. If its version string differs
// from FW_VERSION above, downloads and flashes
// /api/firmware/latest.bin, then reboots automatically.
// ==========================================

unsigned long lastFirmwareCheck = 0;
const unsigned long FIRMWARE_CHECK_INTERVAL_MS = 3600000UL; // 1 hour

// Registration is rate limited server-side, and the loop runs every 300ms,
// so an un-provisioned board must not hammer it (which would burn its own
// quota and lock itself out of re-registering).
unsigned long lastRegisterAttempt = 0;
const unsigned long REGISTER_RETRY_INTERVAL_MS = 30000UL; // 30 seconds

void checkForFirmwareUpdate() {
  if (WiFi.status() != WL_CONNECTED || !timeSynced) return;

  HTTPClient http;
  String versionUrl = String("https://") + serverHost + "/api/firmware/version";
  http.begin(secureClient, versionUrl);
  http.setTimeout(15000);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  if (body.indexOf("\"available\":true") == -1) return; // nothing published

  int vStart = body.indexOf("\"version\":\"") + 11;
  int vEnd = body.indexOf('"', vStart);
  String latestVersion = body.substring(vStart, vEnd);

  if (latestVersion == FW_VERSION || latestVersion.length() == 0) return;

  Serial.println("New firmware available: " + latestVersion + " (running " + FW_VERSION + ") — updating...");

  // Same verified TLS client as every other request, so the image can only
  // come from a host presenting a certificate for serverHost that chains to
  // a root in certs.h. The backend also sends an x-MD5 header, which the
  // HTTPUpdate library hands to the Updater to verify the flashed bytes.
  //
  // What this still does NOT prove is AUTHENTICITY: the image is not
  // cryptographically signed, so anyone who can publish to the backend's
  // firmware_releases directory can publish firmware to every ball. See
  // "OTA authenticity" in the README -- that needs signing keys and ESP32
  // secure boot, which is a hardware-fusing operation, not a code change.
  String binUrl = String("https://") + serverHost + "/api/firmware/latest.bin";
  t_httpUpdate_return result = httpUpdate.update(secureClient, binUrl);

  switch (result) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("OTA failed: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("OTA: server reported no update.");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("OTA OK — rebooting.");
      break;
  }
}

// ==========================================
// SETUP / LOOP
// ==========================================

void setup() {
  Serial.begin(115200);

  pinMode(VIB_PIN, INPUT);

  secureClient.setCACert(BACKEND_ROOT_CA_BUNDLE);

  Wire.begin();
  Wire.setClock(400000);   // fast-mode I2C, so the impact window gets samples
  mpu.initialize();

  // Without these the part stays at its +/-2 g and +/-250 deg/s defaults,
  // and every real kick saturates both: the reading was the same number
  // for a tap and for a full strike. These are the widest ranges the
  // MPU6050 offers.
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_16);
  mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_2000);

  if (!mpu.testConnection()) {
    Serial.println("MPU6050 init FAILED.");
  }

  prefs.begin("football", false);
  deviceId = prefs.getString("device_id", "");
  deviceToken = prefs.getString("device_token", "");
  pairingCode = prefs.getString("pairing_code", "");

  connectWiFi();
  ensureTimeSynced();

  // A board flashed before pairing codes existed has credentials but no
  // code, so it cannot be claimed. Re-registering fixes that while it is
  // still unclaimed; if it is already claimed the server answers 409 and it
  // simply carries on with the credentials it has.
  if (deviceId == "" || deviceToken == "" || pairingCode == "") {
    if (WiFi.status() == WL_CONNECTED && timeSynced) {
      lastRegisterAttempt = millis();
      registerDevice();
    } else {
      Serial.println("No WiFi yet — will attempt device registration once connected.");
    }
  } else {
    Serial.println("Loaded existing device_id from flash: " + deviceId);
    printPairingInstructions();
  }
}

void loop() {
  // Re-check WiFi every loop; if it drops mid-session, try to recover.
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Keeps retrying after a failed or missed sync; a no-op once synced.
  ensureTimeSynced();

  // Finish registration if it didn't happen in setup() because WiFi wasn't
  // up yet, or re-provision after the backend revoked these credentials.
  if ((deviceId == "" || deviceToken == "") && WiFi.status() == WL_CONNECTED && timeSynced &&
      millis() - lastRegisterAttempt > REGISTER_RETRY_INTERVAL_MS) {
    lastRegisterAttempt = millis();
    registerDevice();
  }

  if (millis() - lastFirmwareCheck > FIRMWARE_CHECK_INTERVAL_MS) {
    lastFirmwareCheck = millis();
    checkForFirmwareUpdate();
  }

  if (digitalRead(VIB_PIN) == HIGH) {
    ImpactMeasurement impact = captureImpact();

    if (impact.samples >= IMPACT_MIN_SAMPLES) {
      if (impact.accelSaturated) {
        Serial.println("Impact exceeded +/-16 g - peak is a lower bound.");
      }
      if (impact.gyroSaturated) {
        Serial.println("Spin exceeded +/-2000 deg/s - rate is a lower bound.");
      }

      // Field order is unchanged (speed, spin, force, distance) so the
      // backend, database and history stay compatible. What each field
      // now carries is documented above captureImpact() and mirrored by
      // the labels in the app.
      sendReading(impact.speedIndex, impact.peakRpm, impact.peakG, impact.derivedCarry);
    } else {
      Serial.printf("Impact window too short (%d samples) - discarded.\n", impact.samples);
    }
  }

  delay(50);
}
