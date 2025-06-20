#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <esp_ota_ops.h>

// === I2C EEPROM Setup ===
#define EEPROM_ADDR 0x50
bool sensorConnected = false;

// === Wi-Fi STA Setup ===
const char* ssid = "DT";
const char* password = "11111111";
IPAddress local_IP(192, 168, 137, 15);
IPAddress gateway(192, 168, 137, 1);
IPAddress subnet(255, 255, 255, 0);
WebServer server(80);

// === Oscillation Data ===
#define MAX_OSCILLATIONS 20
float oscillation_times[MAX_OSCILLATIONS];
int oscillation_count = 0;
bool collecting = false;
bool data_ready = false;

// === Sensor Pin ===
const int sensorPin = 4;  // MH LDR D0 output to GPIO4
volatile unsigned long lastBreakStart = 0;
volatile unsigned long lastBreakEnd = 0;
volatile unsigned long lastHalfCycleStart = 0;
volatile bool beamBroken = false;
volatile unsigned long lastInterrupt = 0;
const unsigned long DEBOUNCE_DELAY = 10000; // 10 ms in microseconds

unsigned long lastEEPROMCheck = 0;
const unsigned long EEPROM_CHECK_INTERVAL = 5000;

// === EEPROM I2C Check ===
bool checkEEPROM() {
  Wire.beginTransmission(EEPROM_ADDR);
  int error = Wire.endTransmission();
  if (error != 0) {
    Serial.printf("✘ I2C error: %d\n", error);
    return false;
  }
  Wire.requestFrom(EEPROM_ADDR, 1);
  if (!Wire.available()) {
    Serial.println("✘ No data available from EEPROM");
    return false;
  }
  Wire.read(); // Consume the byte
  return true;
}

// === Reboot to OTA Partition ===
void rebootToOTAPartition() {
  Serial.println("✘ EEPROM not detected. Rebooting to OTA partition...");
  const esp_partition_t *ota_0 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
  if (ota_0) {
    esp_err_t err = esp_ota_set_boot_partition(ota_0);
    if (err == ESP_OK) {
      Serial.println("✓ Boot partition set to ota_0");
    } else {
      Serial.printf("✘ Failed to set boot partition: %d\n", err);
    }
  } else {
    Serial.println("✘ Could not find ota_0 partition");
  }
  delay(2000);
  ESP.restart();
}

// === Interrupt Handler ===
void IRAM_ATTR onBeamBreak() {
  unsigned long now = micros();
  if (now - lastInterrupt < DEBOUNCE_DELAY) return;
  lastInterrupt = now;

  if (digitalRead(sensorPin) == LOW) {
    lastBreakStart = now;
  } else if (digitalRead(sensorPin) == HIGH) {
    lastBreakEnd = now;
    beamBroken = true;
  }
}

// === Web Server Routes ===
void setupRoutes() {
  server.on("/", HTTP_GET, []() {
    String html = 
      "<h1>ESP32 Oscillation Mode</h1>"
      "<p><a href='/start_oscillation'>Start Oscillation</a></p>"
      "<p><a href='/status'>Check Status</a></p>"
      "<p><a href='/oscillation_data'>Get Data</a></p>"
      "<p><a href='/reboot_to_ota'>Reboot to OTA</a></p>"
      "<hr><h2>OTA Update</h2>"
      "<form method='POST' action='/update' enctype='multipart/form-data'>"
      "<input type='file' name='update'><input type='submit' value='Upload'></form>";
    server.send(200, "text/html", html);
  });

  server.on("/update", HTTP_POST, []() {
    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");
    delay(200);
    if (!Update.hasError()) {
      Serial.println("✓ OTA Update successful. Rebooting...");
      const esp_partition_t *running = esp_ota_get_running_partition();
      const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
      Serial.printf("Running partition: %s\n", running->label);
      Serial.printf("Updated partition: %s\n", next->label);
      ESP.restart();
    } else {
      Serial.println("✘ OTA update failed.");
    }
  }, []() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("OTA Start: %s\n", upload.filename.c_str());
      const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
      Serial.printf("Writing to partition: %s\n", next->label);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) Update.printError(Serial);
    } else if (upload.status == UPLOAD_FILE_END) {
      if (!Update.end(true)) Update.printError(Serial);
      else Serial.printf("OTA Success: %u bytes\n", upload.totalSize);
    }
  });

  server.on("/start_oscillation", HTTP_GET, []() {
    oscillation_count = 0;
    data_ready = false;
    collecting = true;
    lastHalfCycleStart = micros();
    Serial.println("✓ Started oscillation data collection");
    server.send(200, "application/json", "{\"status\": \"started\"}");
  });

  server.on("/status", HTTP_GET, []() {
    DynamicJsonDocument doc(256);
    doc["collecting"] = collecting;
    doc["oscillations"] = oscillation_count;
    doc["ready"] = data_ready;
    doc["max_oscillations"] = MAX_OSCILLATIONS;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.on("/oscillation_data", HTTP_GET, []() {
    if (!data_ready) {
      Serial.println("✘ Oscillation data not ready");
      server.send(200, "application/json", "{\"error\": \"Data not ready\"}");
      return;
    }
    DynamicJsonDocument doc(2048);
    JsonArray arr = doc.createNestedArray("times_ms");
    for (int i = 0; i < oscillation_count; i++) {
      if (oscillation_times[i] > 0) { // Only include valid times
        arr.add(oscillation_times[i]);
      }
    }
    doc["oscillation_count"] = oscillation_count;
    String jsonStr;
    serializeJson(doc, jsonStr);
    Serial.printf("Sending oscillation data: %s\n", jsonStr.c_str());
    server.send(200, "application/json", jsonStr);
  });

  server.on("/reboot_to_ota", HTTP_GET, []() {
    server.send(200, "text/plain", "Rebooting to OTA partition...");
    delay(100);
    Serial.println("✓ Rebooting to OTA partition...");
    const esp_partition_t *ota_0 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    if (ota_0) {
      esp_err_t err = esp_ota_set_boot_partition(ota_0);
      if (err == ESP_OK) {
        Serial.println("✓ Boot partition set to ota_0");
      } else {
        Serial.printf("✘ Failed to set boot partition: %d\n", err);
      }
    } else {
      Serial.println("✘ Could not find ota_0 partition");
    }
    delay(2000);
    ESP.restart();
  });

  server.begin();
  Serial.println("✓ HTTP Server Ready - Oscillation Mode");
}

// === Setup ===
void setup() {
  Serial.begin(115200);
  const esp_partition_t *running = esp_ota_get_running_partition();
  Serial.printf("Booting from partition: %s\n", running->label);
  Serial.println("ESP32 Oscillation Mode Starting...");

  pinMode(sensorPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(sensorPin), onBeamBreak, CHANGE);

  Wire.begin();
  sensorConnected = checkEEPROM();
  if (!sensorConnected) rebootToOTAPartition();

  if (!WiFi.config(local_IP, gateway, subnet)) {
    Serial.println("✘ Failed to configure static IP");
  }
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\n✓ Connected to WiFi, IP: ");
  Serial.println(WiFi.localIP());

  setupRoutes();
}

// === Loop ===
void loop() {
  server.handleClient();

  // Periodic EEPROM check
  if (millis() - lastEEPROMCheck > EEPROM_CHECK_INTERVAL) {
    if (!checkEEPROM()) {
      collecting = false; // Stop collection to avoid partial data
      rebootToOTAPartition();
    }
    lastEEPROMCheck = millis();
  }

  // Process oscillation data
  if (beamBroken && collecting && oscillation_count < MAX_OSCILLATIONS) {
    beamBroken = false;
    static int breakCount = 0;
    breakCount++;
    if (breakCount % 2 == 0) {  // Every 2 beam breaks = 1 oscillation
      unsigned long halfCycleTime = lastBreakStart - lastHalfCycleStart;
      lastHalfCycleStart = lastBreakStart;
      unsigned long blockTime = lastBreakEnd - lastBreakStart;
      float oscTimeMs = 2.0 * (halfCycleTime + blockTime / 2.0) / 1000.0;

      if (oscTimeMs > 0 && oscTimeMs < 10000) { // Validate time (e.g., < 10 seconds)
        oscillation_times[oscillation_count++] = oscTimeMs;
        Serial.printf("Oscillation %d/%d: %.2f ms\n", oscillation_count, MAX_OSCILLATIONS, oscTimeMs);
      } else {
        Serial.printf("✘ Invalid oscillation time: %.2f ms\n", oscTimeMs);
      }

      if (oscillation_count >= MAX_OSCILLATIONS) {
        collecting = false;
        data_ready = true;
        Serial.println("✓ Oscillation data collection complete. Ready to serve.");
      }
    }
  }
}