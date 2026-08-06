#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Wire.h>
#include <MPU6050.h>
#include <Preferences.h>

MPU6050 mpu;
Preferences prefs;

#define FW_VERSION "1.1.0"

// Tried in order at boot and on reconnect. Add a venue's network here
// ahead of an event instead of reflashing on-site.
struct WifiNetwork { const char* ssid; const char* password; };
WifiNetwork knownNetworks[] = {
  {"AirFiber-VZS0-SR", "11223344"},
  // {"venue-wifi-name", "venue-password"},
};
const int knownNetworkCount = sizeof(knownNetworks) / sizeof(knownNetworks[0]);

// Public backend host (no scheme, no trailing slash) — this is what makes
// the ball work on ANY Wi-Fi with internet (college, public, mobile
// hotspot), not just the one network its old local-IP address lived on.
const char* serverHost = "smart-football-backend.onrender.com";

// Render's free tier serves HTTPS only, so we go over TLS. setInsecure()
// skips certificate validation — acceptable for a prototype/demo talking to
// a known host, but note this is not certificate-pinned; a proper
// production device would validate against Render's CA instead.
WiFiClientSecure secureClient;

#define VIB_PIN 27

// Wire a resistor-divider from the battery to this ADC pin once a battery
// is actually fitted (see Slide 13/22 — LiFePO4, not yet on this
// breadboard build). Left unconnected today on purpose.
#define BATTERY_ADC_PIN 34

int16_t ax, ay, az, gx, gy, gz;

// ==========================================
// DEVICE IDENTITY (persisted across reboots in NVS)
// ==========================================

String deviceId = "";
String deviceToken = "";

String getDeviceUid() {
  uint64_t chipid = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%016llX", (unsigned long long)chipid);
  return String(buf);
}

// Registers this board with the backend on its very first boot and saves
// the returned credentials to flash (NVS) so it never has to register
// again. If NVS already has credentials, this is skipped entirely.
bool registerDevice() {
  String deviceUid = getDeviceUid();
  Serial.println("Registering device, uid=" + deviceUid);

  HTTPClient http;
  String url = String("https://") + serverHost + "/api/device/register";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(60000);

  String payload = String("{\"device_uid\":\"") + deviceUid + "\"}";
  int code = http.POST(payload);

  if (code == 201) {
    String body = http.getString();
    // Minimal hand-rolled parse — the response is a small, fixed-shape
    // object we control on the server side, so a JSON library is overkill.
    int idStart = body.indexOf("\"device_id\":\"") + 14;
    int idEnd = body.indexOf('"', idStart);
    int tokStart = body.indexOf("\"device_token\":\"") + 17;
    int tokEnd = body.indexOf('"', tokStart);

    deviceId = body.substring(idStart, idEnd);
    deviceToken = body.substring(tokStart, tokEnd);

    prefs.putString("device_id", deviceId);
    prefs.putString("device_token", deviceToken);

    Serial.println("Registered. device_id=" + deviceId);
    http.end();
    return true;
  }

  if (code == 409) {
    // A row with this device_uid already exists but we have no local
    // token — this only happens if NVS was erased after a prior
    // successful registration. There's no safe way to recover the token
    // automatically (see backend/server.py's comment on why /register
    // refuses to hand it out twice); the row needs to be deleted in
    // Supabase manually before this board can register again.
    Serial.println("Device already registered server-side but token is missing locally. Delete the football_devices row for this device_uid and reboot.");
  } else {
    Serial.printf("Registration failed, HTTP %d\n", code);
  }

  http.end();
  return false;
}

// ==========================================
// WIFI
// ==========================================

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
  if (WiFi.status() != WL_CONNECTED || deviceId == "") {
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

void checkForFirmwareUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;

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

  secureClient.setInsecure();

  Wire.begin();
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU6050 init FAILED.");
  }

  prefs.begin("football", false);
  deviceId = prefs.getString("device_id", "");
  deviceToken = prefs.getString("device_token", "");

  connectWiFi();

  if (deviceId == "" || deviceToken == "") {
    if (WiFi.status() == WL_CONNECTED) {
      registerDevice();
    } else {
      Serial.println("No WiFi yet — will attempt device registration once connected.");
    }
  } else {
    Serial.println("Loaded existing device_id from flash: " + deviceId);
  }
}

void loop() {
  // Re-check WiFi every loop; if it drops mid-session, try to recover.
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Finish registration if it didn't happen in setup() because WiFi
  // wasn't up yet.
  if ((deviceId == "" || deviceToken == "") && WiFi.status() == WL_CONNECTED) {
    registerDevice();
  }

  if (millis() - lastFirmwareCheck > FIRMWARE_CHECK_INTERVAL_MS) {
    lastFirmwareCheck = millis();
    checkForFirmwareUpdate();
  }

  int vibration = digitalRead(VIB_PIN);

  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  float speed = abs(ax) / 500.0;
  float spin = abs(gz) / 100.0;
  float force = abs(ay) / 500.0;
  float distance = speed * 2.5;

  if (vibration == HIGH) {
    sendReading(speed, spin, force, distance);
  }

  delay(300);
}
