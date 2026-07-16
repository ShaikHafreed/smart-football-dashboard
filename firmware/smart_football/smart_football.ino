#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <MPU6050.h>

MPU6050 mpu;

const char* ssid = "S22Ultra";
const char* password = "hafreed@143";

const char* serverIP = "10.199.158.205"; // CHANGE TO YOUR LAPTOP IP

#define VIB_PIN    27
#define RESET_PIN  26   // push button -> GND, uses internal pull-up. CHANGE if wired differently.
#define BUZZER_PIN 25   // buzzer +.                              CHANGE if wired differently.

int16_t ax, ay, az, gx, gy, gz;

bool errorState = false;   // true whenever something is wrong; drives the buzzer
bool mpuOk = false;

// simple debounce for the reset button
bool lastButtonReading = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_MS = 50;

void setBuzzer(bool on) {
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

void beep(int times, int onMs = 80, int offMs = 80) {
  for (int i = 0; i < times; i++) {
    setBuzzer(true);
    delay(onMs);
    setBuzzer(false);
    delay(offMs);
  }
}

void connectWiFi() {
  Serial.println("Connecting WiFi...");
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi Connected!");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("WiFi FAILED to connect.");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(VIB_PIN, INPUT);
  pinMode(RESET_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  setBuzzer(false);

  Wire.begin();
  mpu.initialize();
  mpuOk = mpu.testConnection();

  if (!mpuOk) {
    Serial.println("MPU6050 init FAILED.");
  }

  connectWiFi();

  // Startup problem already present (MPU or WiFi) -> alert immediately.
  errorState = (!mpuOk) || (WiFi.status() != WL_CONNECTED);
  setBuzzer(errorState);
}

// Reset button: press to fully reset the hardware (clears any error/buzzer
// state and restarts the whole board, exactly like power-cycling it).
void checkResetButton() {
  bool reading = digitalRead(RESET_PIN);

  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_MS) {
    if (reading == LOW) { // button pressed (pulled to GND)
      Serial.println("Reset button pressed -> restarting device.");
      beep(2, 100, 100);
      setBuzzer(false);
      delay(100);
      ESP.restart();
    }
  }

  lastButtonReading = reading;
}

void loop() {
  checkResetButton();

  // Re-check WiFi every loop; if it drops mid-session, alert and try to recover.
  if (WiFi.status() != WL_CONNECTED) {
    errorState = true;
    setBuzzer(true);
    connectWiFi();
  }

  int vibration = digitalRead(VIB_PIN);

  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  float speed = abs(ax) / 500.0;
  float spin = abs(gz) / 100.0;
  float force = abs(ay) / 500.0;
  float distance = speed * 2.5;

  if (vibration == HIGH && !errorState) {

    HTTPClient http;

    String url = String("http://") + serverIP + ":5000/api/data";

    String payload =
      String("{\"speed\":") + String(speed, 2) +
      ",\"spin\":" + String(spin, 2) +
      ",\"force\":" + String(force, 2) +
      ",\"distance\":" + String(distance, 2) +
      ",\"shot\":\"kick\"}";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    int responseCode = http.POST(payload);

    Serial.print("Kick Sent -> ");
    Serial.println(responseCode);

    if (responseCode != 200) {
      // Send failed (server unreachable, wrong IP, etc.) -> alert until reset.
      errorState = true;
      setBuzzer(true);
    }

    http.end();
  }

  delay(300);
}
