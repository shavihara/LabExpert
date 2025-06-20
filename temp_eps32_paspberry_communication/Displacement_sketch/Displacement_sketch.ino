#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <esp_ota_ops.h>

// === TOF400F Serial Setup ===
HardwareSerial TOFSerial(2);
#define TOF_RX 16
#define TOF_TX 17
byte modbusBuffer[20];
int bufferIndex = 0;

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

// === Distance Data ===
#define MAX_SAMPLES 40
uint16_t distances[MAX_SAMPLES];
int sampleCount = 0;
bool collecting = false;
bool dataReady = false;

unsigned long lastRequestTime = 0;
const unsigned long REQUEST_INTERVAL = 100; // 10 Hz
unsigned long lastEEPROMCheck = 0;
const unsigned long EEPROM_CHECK_INTERVAL = 5000;

// === CRC Calculation (Modbus RTU) ===
uint16_t calculateCRC(byte* data, int length) {
  uint16_t crc = 0xFFFF;
  for (int i = 0; i < length; i++) {
    crc ^= data[i];
    for (int j = 0; j < 8; j++) {
      crc = (crc >> 1) ^ ((crc & 1) ? 0xA001 : 0);
    }
  }
  return crc;
}

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

// === Web Server Routes ===
void setupRoutes() {
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html",
      "<h1>ESP32 Displacement Mode</h1>"
      "<p><a href='/start'>Start Collection</a></p>"
      "<p><a href='/status'>Check Status</a></p>"
      "<p><a href='/data'>Get Data</a></p>"
      "<p><a href='/reboot_to_ota'>Reboot to OTA</a></p>"
      "<hr><h2>OTA Update</h2>"
      "<form method='POST' action='/update' enctype='multipart/form-data'>"
      "<input type='file' name='update'><input type='submit' value='Upload'></form>");
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

  server.on("/start", HTTP_GET, []() {
    sampleCount = 0;
    dataReady = false;
    collecting = true;
    Serial.println("✓ Started displacement data collection");
    server.send(200, "application/json", "{\"status\": \"started\"}");
  });

  server.on("/status", HTTP_GET, []() {
    DynamicJsonDocument doc(256);
    doc["collecting"] = collecting;
    doc["samples"] = sampleCount;
    doc["ready"] = dataReady;
    doc["max_samples"] = MAX_SAMPLES;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.on("/data", HTTP_GET, []() {
    if (!dataReady) {
      server.send(200, "application/json", "{\"error\": \"Data not ready\"}");
      return;
    }
    DynamicJsonDocument doc(2048);
    JsonArray arr = doc.createNestedArray("distances");
    for (int i = 0; i < MAX_SAMPLES; i++) arr.add(distances[i]);
    doc["sample_count"] = MAX_SAMPLES;
    doc["sample_rate_hz"] = 10;
    String jsonStr;
    serializeJson(doc, jsonStr);
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
}

// === Setup ===
void setup() {
  Serial.begin(115200);
  const esp_partition_t *running = esp_ota_get_running_partition();
  Serial.printf("Booting from partition: %s\n", running->label);
  Serial.println("ESP32 Displacement Mode Starting...");

  Wire.begin();
  sensorConnected = checkEEPROM();
  if (!sensorConnected) rebootToOTAPartition();

  TOFSerial.begin(115200, SERIAL_8N1, TOF_RX, TOF_TX);

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
  server.begin();
  Serial.println("✓ HTTP Server Ready - Displacement Mode");
}

// === Loop ===
void loop() {
  server.handleClient();

  // Periodic EEPROM check
  if (millis() - lastEEPROMCheck > EEPROM_CHECK_INTERVAL) {
    if (!checkEEPROM()) rebootToOTAPartition();
    lastEEPROMCheck = millis();
  }

  // Handle serial input
  while (TOFSerial.available()) {
    byte inByte = TOFSerial.read();
    if (bufferIndex < sizeof(modbusBuffer)) modbusBuffer[bufferIndex++] = inByte;
    if (bufferIndex >= 7 &&
        modbusBuffer[0] == 0x01 &&
        modbusBuffer[1] == 0x03 &&
        modbusBuffer[2] == 0x02) {
      processModbusPacket();
      bufferIndex = 0;
    }
  }

  // Distance request loop
  if (collecting && sampleCount < MAX_SAMPLES && millis() - lastRequestTime >= REQUEST_INTERVAL) {
    requestDistance();
    lastRequestTime = millis();
  }
}

// === Modbus Request ===
void requestDistance() {
  if (sampleCount >= MAX_SAMPLES) {
    collecting = false;
    dataReady = true;
    Serial.println("✓ Data collection complete. Ready to serve.");
    return;
  }

  byte request[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x01, 0x84, 0x0A};
  TOFSerial.write(request, sizeof(request));
}

// === Process Modbus Packet ===
void processModbusPacket() {
  uint16_t receivedCRC = (modbusBuffer[5]) | (modbusBuffer[6] << 8);
  uint16_t calculatedCRC = calculateCRC(modbusBuffer, 5);
  if (receivedCRC != calculatedCRC) {
    Serial.println("✘ CRC Error - Packet ignored");
    return;
  }

  if (!collecting || sampleCount >= MAX_SAMPLES) return;

  uint16_t distance = (modbusBuffer[3] << 8) | modbusBuffer[4];
  Serial.printf("Distance: %d mm\n", distance);

  distances[sampleCount++] = distance;
  Serial.printf("Sample %d/%d\n", sampleCount, MAX_SAMPLES);

  if (sampleCount >= MAX_SAMPLES) {
    collecting = false;
    dataReady = true;
    Serial.println("✓ Data collection complete. Ready to serve.");
  }
}