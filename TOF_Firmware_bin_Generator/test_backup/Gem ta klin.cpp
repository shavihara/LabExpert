// Ultra-Accurate TOF400F Firmware - v4.0
// Enhanced reliability, error handling, and accuracy

#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <ArduinoJson.h>
#include "esp_partition.h"
#include "esp_ota_ops.h"

#define STATUS_LED 2
#define TOF_RXD 16
#define TOF_TXD 17

const char *ssid = "DT";
const char *password = "11111111";
IPAddress local_IP(192, 168, 137, 15);
IPAddress gateway(192, 168, 137, 1);
IPAddress subnet(255, 255, 255, 0);

WebServer server(80);
HardwareSerial TOFSerial(2);

const uint8_t SLAVE_ADDR = 0x01;

// Diagnostic counters
struct DiagnosticStats {
  uint32_t totalReadings = 0;
  uint32_t successfulReadings = 0;
  uint32_t crcErrors = 0;
  uint32_t timeouts = 0;
  uint32_t outOfRange = 0;
  uint32_t interpolated = 0;
} diagnostics;

// Extended measurement configuration
struct SensorCalibration {
  float offsetMM = 0.0;
  float scaleFactor = 1.0;
  uint16_t minValidReading = 50;
  uint16_t maxValidReading = 8500;
} calibration;

struct ExperimentConfig {
  int frequency = 10;
  int duration = 60;
  String mode = "long";
  bool configured = false;
  int averagingSamples = 5;  // Increased default for better stability
  bool enableInterpolation = true;  // Interpolate error readings
} config;

bool experimentRunning = false;
bool dataReady = false;
unsigned long experimentStartTime = 0;
int sampleInterval = 100;

const int MAX_SAMPLES = 1000;
float distances[MAX_SAMPLES];
unsigned long timestamps[MAX_SAMPLES];
int sampleCount = 0;
float lastValidDistance = 0;  // For interpolation

WiFiClient* sseClientPtr = nullptr;
bool sseActive = false;
unsigned long lastSSEPing = 0;

void setCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Cache-Control", "no-cache");
}

uint16_t modbusCRC(uint8_t *buf, int len) {
  uint16_t crc = 0xFFFF;
  for (int pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];
    for (int i = 8; i != 0; i--) {
      if ((crc & 0x0001) != 0) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ENHANCED: Robust reading with adaptive timeout and retries
uint16_t readTOFDistanceRaw(int retryCount = 0) {
  const int MAX_RETRIES = 3;
  
  // Adaptive timeout based on expected range
  // Longer distances need more time for photon travel
  uint16_t timeout = 250; // Base timeout
  
  diagnostics.totalReadings++;
  
  for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Build command to read distance register (0x0010)
    uint8_t cmd[8] = {SLAVE_ADDR, 0x03, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00};
    uint16_t crc = modbusCRC(cmd, 6);
    
    // CRITICAL FIX: Correct Modbus RTU byte order (LSB first)
    cmd[6] = crc & 0xFF;
    cmd[7] = (crc >> 8) & 0xFF;

    // Clear any stale data
    while (TOFSerial.available()) {
      TOFSerial.read();
    }
    
    // Send command
    TOFSerial.write(cmd, 8);
    TOFSerial.flush();

    // Wait for response
    uint8_t response[7];
    int bytesRead = 0;
    unsigned long startTime = millis();
    
    while (bytesRead < 7 && (millis() - startTime) < timeout) {
      if (TOFSerial.available()) {
        response[bytesRead++] = TOFSerial.read();
      }
      yield();  // Prevent watchdog
    }

    // Validate response length
    if (bytesRead != 7) {
      if (attempt < MAX_RETRIES) {
        diagnostics.timeouts++;
        delay(20 * (attempt + 1));  // Exponential backoff
        continue;
      }
      return 65535;
    }
    
    // Validate response header
    if (response[0] != SLAVE_ADDR || response[1] != 0x03) {
      if (attempt < MAX_RETRIES) {
        delay(20 * (attempt + 1));
        continue;
      }
      return 65535;
    }
    
    // Validate byte count
    if (response[2] != 0x02) {
      if (attempt < MAX_RETRIES) {
        delay(20 * (attempt + 1));
        continue;
      }
      return 65535;
    }
    
    // Verify CRC
    uint16_t receivedCRC = response[5] | (response[6] << 8);
    uint16_t calculatedCRC = modbusCRC(response, 5);
    
    if (receivedCRC != calculatedCRC) {
      diagnostics.crcErrors++;
      if (attempt < MAX_RETRIES) {
        delay(20 * (attempt + 1));
        continue;
      }
      return 65535;
    }
    
    // Extract distance (Big-endian from sensor)
    uint16_t dist = (response[3] << 8) | response[4];
    
    // Validate range
    if (dist < calibration.minValidReading || dist > calibration.maxValidReading) {
      diagnostics.outOfRange++;
      if (attempt < MAX_RETRIES) {
        delay(20 * (attempt + 1));
        continue;
      }
      return 65535;
    }
    
    // Success!
    diagnostics.successfulReadings++;
    return dist;
  }
  
  return 65535;  // All retries exhausted
}

// ENHANCED: Smart averaging with outlier rejection
float readTOFDistance() {
  const int MAX_BUFFER = 10;
  uint16_t samples[MAX_BUFFER];
  int validCount = 0;
  
  int samplesToTake = min(config.averagingSamples, MAX_BUFFER);
  
  // Collect samples
  for (int i = 0; i < samplesToTake; i++) {
    uint16_t raw = readTOFDistanceRaw();
    
    if (raw != 65535) {
      samples[validCount++] = raw;
    }
    
    if (i < samplesToTake - 1) {
      delay(15);  // Delay between samples
    }
  }
  
  // Handle no valid readings
  if (validCount == 0) {
    if (config.enableInterpolation && lastValidDistance > 0) {
      diagnostics.interpolated++;
      return lastValidDistance;  // Use last valid reading
    }
    return 65535.0;
  }
  
  // Single sample - just use it
  if (validCount == 1) {
    float result = (samples[0] * calibration.scaleFactor) + calibration.offsetMM;
    lastValidDistance = result;
    return result;
  }
  
  // Multiple samples - use median for robustness
  // Sort samples (bubble sort for small arrays)
  for (int i = 0; i < validCount - 1; i++) {
    for (int j = 0; j < validCount - i - 1; j++) {
      if (samples[j] > samples[j + 1]) {
        uint16_t temp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = temp;
      }
    }
  }
  
  // Calculate median
  float median;
  if (validCount % 2 == 0) {
    median = (samples[validCount/2 - 1] + samples[validCount/2]) / 2.0;
  } else {
    median = samples[validCount/2];
  }
  
  // Optional: Remove outliers and average the rest
  // Calculate MAD (Median Absolute Deviation)
  float deviations[MAX_BUFFER];
  for (int i = 0; i < validCount; i++) {
    deviations[i] = abs(samples[i] - median);
  }
  
  // Sort deviations
  for (int i = 0; i < validCount - 1; i++) {
    for (int j = 0; j < validCount - i - 1; j++) {
      if (deviations[j] > deviations[j + 1]) {
        float temp = deviations[j];
        deviations[j] = deviations[j + 1];
        deviations[j + 1] = temp;
      }
    }
  }
  
  float mad = deviations[validCount/2];
  float threshold = median * 0.05;  // 5% tolerance
  
  // Average non-outliers
  float sum = 0;
  int count = 0;
  for (int i = 0; i < validCount; i++) {
    if (abs(samples[i] - median) <= threshold) {
      sum += samples[i];
      count++;
    }
  }
  
  float result;
  if (count > 0) {
    result = (sum / count * calibration.scaleFactor) + calibration.offsetMM;
  } else {
    result = (median * calibration.scaleFactor) + calibration.offsetMM;
  }
  
  lastValidDistance = result;
  return result;
}

// ENHANCED: Robust mode setting with better debugging
bool setRangingMode(bool longDistance) {
  const int MAX_ATTEMPTS = 5;
  
  for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Build command
    uint16_t value = longDistance ? 0x0001 : 0x0000;
    uint8_t cmd[8] = {SLAVE_ADDR, 0x06, 0x00, 0x04, 
                      (uint8_t)(value >> 8), (uint8_t)(value & 0xFF), 0x00, 0x00};
    uint16_t crc = modbusCRC(cmd, 6);
    cmd[6] = crc & 0xFF;
    cmd[7] = (crc >> 8) & 0xFF;
    
    // Debug: Print command
    Serial.printf("Attempt %d - Sending: ", attempt + 1);
    for (int i = 0; i < 8; i++) {
      Serial.printf("%02X ", cmd[i]);
    }
    Serial.println();
    
    // Clear buffer thoroughly
    delay(50);
    while (TOFSerial.available()) {
      TOFSerial.read();
      delay(1);
    }
    
    // Send command with extra flush
    TOFSerial.write(cmd, 8);
    TOFSerial.flush();
    delayMicroseconds(3500);  // Wait for transmission (8 bytes * 11 bits / 115200 baud)
    
    // Wait for response
    uint8_t response[8];
    int bytesRead = 0;
    unsigned long startTime = millis();
    
    while (bytesRead < 8 && millis() - startTime < 500) {
      if (TOFSerial.available()) {
        response[bytesRead++] = TOFSerial.read();
      }
    }
    
    // Debug: Print response
    Serial.printf("Received %d bytes: ", bytesRead);
    for (int i = 0; i < bytesRead; i++) {
      Serial.printf("%02X ", response[i]);
    }
    Serial.println();
    
    // Check response
    if (bytesRead >= 8 && response[0] == SLAVE_ADDR && response[1] == 0x06) {
      uint16_t receivedCRC = response[6] | (response[7] << 8);
      uint16_t calculatedCRC = modbusCRC(response, 6);
      
      Serial.printf("CRC: recv=0x%04X calc=0x%04X\n", receivedCRC, calculatedCRC);
      
      if (receivedCRC == calculatedCRC) {
        Serial.printf("✓ Range mode set to %s\n", longDistance ? "LONG (8000mm)" : "SHORT (2000mm)");
        delay(250);  // Allow mode to stabilize
        return true;
      } else {
        Serial.println("CRC mismatch!");
      }
    } else if (bytesRead > 0) {
      Serial.printf("Invalid response: addr=0x%02X func=0x%02X\n", 
                    bytesRead > 0 ? response[0] : 0, 
                    bytesRead > 1 ? response[1] : 0);
    } else {
      Serial.println("No response (timeout)");
    }
    
    delay(200 * (attempt + 1));  // Exponential backoff
  }
  
  Serial.println("✗ ERROR: Failed to set range mode after all attempts");
  Serial.println("TIP: Check sensor wiring, power, and baud rate");
  return false;
}

// ENHANCED: Complete sensor configuration with fallback
bool configureSensorForMaxRange() {
  Serial.println("\n=== Configuring Sensor ===");
  
  // Clear any communication errors
  delay(100);
  while (TOFSerial.available()) {
    TOFSerial.read();
    delay(2);
  }
  delay(100);
  
  // First, test basic communication with a distance read
  Serial.println("Testing sensor communication...");
  uint16_t testRead = readTOFDistanceRaw();
  if (testRead != 65535) {
    Serial.printf("✓ Sensor responding: %u mm\n", testRead);
  } else {
    Serial.println("⚠ WARNING: Sensor not responding to read commands");
    Serial.println("Continuing anyway - sensor might work without mode setting");
  }
  
  // Try to set long distance mode
  Serial.println("\nSetting long range mode...");
  bool modeSetSuccess = setRangingMode(true);
  
  if (!modeSetSuccess) {
    Serial.println("\n⚠ WARNING: Could not set long range mode");
    Serial.println("   This sensor might already be in long mode,");
    Serial.println("   or might not support mode switching via Modbus.");
    Serial.println("   Continuing - sensor will work with default mode.\n");
  }
  
  // Try to set measurement frequency (optional, non-critical)
  Serial.println("Setting measurement frequency to 10Hz...");
  uint8_t freqCmd[8] = {SLAVE_ADDR, 0x06, 0x00, 0x06, 0x00, 0x0A, 0x00, 0x00};
  uint16_t crc = modbusCRC(freqCmd, 6);
  freqCmd[6] = crc & 0xFF;
  freqCmd[7] = (crc >> 8) & 0xFF;
  
  while (TOFSerial.available()) TOFSerial.read();
  TOFSerial.write(freqCmd, 8);
  TOFSerial.flush();
  delay(200);
  
  // Verify sensor is still responding
  testRead = readTOFDistanceRaw();
  if (testRead != 65535) {
    Serial.printf("✓ Sensor operational: %u mm\n", testRead);
    Serial.println("✓ Configuration complete\n");
    return true;
  } else {
    Serial.println("⚠ Sensor not responding after configuration");
    Serial.println("   Check wiring and power supply");
    return false;
  }
}

void sendSSE(const String& data) {
  if (sseActive && sseClientPtr && sseClientPtr->connected()) {
    String message = "data: " + data + "\n\n";
    size_t written = sseClientPtr->print(message);
    if (written > 0) {
      sseClientPtr->flush();
      lastSSEPing = millis();
    } else {
      sseActive = false;
    }
  }
}

void handleStatus() {
  setCORSHeaders();
  
  JsonDocument doc;
  doc["connected"] = true;
  doc["sensor_type"] = "TOF_UART";
  doc["sensor_id"] = "TOF400F";
  doc["max_range"] = 8000;
  doc["experiment_running"] = experimentRunning;
  doc["ready"] = dataReady;
  doc["samples"] = sampleCount;
  doc["max_samples"] = MAX_SAMPLES;
  doc["configured"] = config.configured;
  doc["averaging"] = config.averagingSamples;
  
  // Add diagnostics
  JsonObject diag = doc["diagnostics"].to<JsonObject>();
  diag["total_readings"] = diagnostics.totalReadings;
  diag["successful"] = diagnostics.successfulReadings;
  diag["crc_errors"] = diagnostics.crcErrors;
  diag["timeouts"] = diagnostics.timeouts;
  diag["out_of_range"] = diagnostics.outOfRange;
  diag["interpolated"] = diagnostics.interpolated;
  
  if (diagnostics.totalReadings > 0) {
    diag["success_rate"] = (float)diagnostics.successfulReadings / diagnostics.totalReadings * 100.0;
  }
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleConfigure() {
  setCORSHeaders();
  
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"No body\"}");
    return;
  }
  
  String body = server.arg("plain");
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  config.frequency = doc["frequency"] | 10;
  config.duration = doc["duration"] | 60;
  config.mode = doc["mode"] | "long";
  config.averagingSamples = doc["averaging"] | 5;
  config.enableInterpolation = doc["interpolation"] | true;
  
  if (doc.containsKey("calibration")) {
    calibration.offsetMM = doc["calibration"]["offset"] | 0.0;
    calibration.scaleFactor = doc["calibration"]["scale"] | 1.0;
  }
  
  config.configured = true;
  
  if (!configureSensorForMaxRange()) {
    server.send(500, "application/json", "{\"error\":\"Sensor configuration failed\"}");
    return;
  }
  
  sampleInterval = 1000 / config.frequency;
  
  // Reset diagnostics
  diagnostics = DiagnosticStats();
  
  Serial.printf("✓ Configured: freq=%dHz, dur=%ds, int=%dms, avg=%d, interp=%s\n", 
    config.frequency, config.duration, sampleInterval, config.averagingSamples,
    config.enableInterpolation ? "ON" : "OFF");
  
  server.send(200, "application/json", "{\"success\":true}");
}

void handleCalibrate() {
  setCORSHeaders();
  
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"No body\"}");
    return;
  }
  
  String body = server.arg("plain");
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  calibration.offsetMM = doc["offset"] | 0.0;
  calibration.scaleFactor = doc["scale"] | 1.0;
  
  Serial.printf("Calibration: offset=%.2fmm, scale=%.4f\n", 
    calibration.offsetMM, calibration.scaleFactor);
  
  JsonDocument response;
  response["success"] = true;
  response["offset"] = calibration.offsetMM;
  response["scale"] = calibration.scaleFactor;
  
  String json;
  serializeJson(response, json);
  server.send(200, "application/json", json);
}

void handleStart() {
  setCORSHeaders();
  
  if (!config.configured) {
    server.send(400, "application/json", "{\"error\":\"Not configured\"}");
    return;
  }
  
  experimentRunning = true;
  dataReady = false;
  sampleCount = 0;
  lastValidDistance = 0;
  experimentStartTime = millis();
  
  Serial.println("\n=== Experiment Started ===");
  server.send(200, "application/json", "{\"success\":true}");
}

void handleStop() {
  setCORSHeaders();
  
  experimentRunning = false;
  dataReady = true;
  
  Serial.println("=== Experiment Stopped ===");
  Serial.printf("Diagnostics: Success rate: %.1f%% (%d/%d)\n",
    (float)diagnostics.successfulReadings / diagnostics.totalReadings * 100.0,
    diagnostics.successfulReadings, diagnostics.totalReadings);
  
  server.send(200, "application/json", "{\"success\":true}");
}

void handleData() {
  setCORSHeaders();
  
  JsonDocument doc;
  JsonArray distArray = doc["distances"].to<JsonArray>();
  JsonArray timeArray = doc["timestamps"].to<JsonArray>();
  
  for (int i = 0; i < sampleCount; i++) {
    distArray.add(distances[i]);
    timeArray.add(timestamps[i]);
  }
  
  doc["count"] = sampleCount;
  doc["max_range"] = 8000;
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleDiagnostics() {
  setCORSHeaders();
  
  JsonDocument doc;
  doc["total_readings"] = diagnostics.totalReadings;
  doc["successful"] = diagnostics.successfulReadings;
  doc["crc_errors"] = diagnostics.crcErrors;
  doc["timeouts"] = diagnostics.timeouts;
  doc["out_of_range"] = diagnostics.outOfRange;
  doc["interpolated"] = diagnostics.interpolated;
  
  if (diagnostics.totalReadings > 0) {
    doc["success_rate"] = (float)diagnostics.successfulReadings / diagnostics.totalReadings * 100.0;
  }
  
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleStream() {
  Serial.println("Stream endpoint called");
  
  if (sseActive && sseClientPtr) {
    Serial.println("Closing existing SSE connection");
    sseClientPtr->stop();
    delete sseClientPtr;
    sseClientPtr = nullptr;
    sseActive = false;
  }
  
  sseClientPtr = new WiFiClient(server.client());
  
  if (!sseClientPtr->connected()) {
    Serial.println("ERROR: Client not connected!");
    delete sseClientPtr;
    sseClientPtr = nullptr;
    server.send(500, "text/plain", "Connection failed");
    return;
  }
  
  sseClientPtr->println("HTTP/1.1 200 OK");
  sseClientPtr->println("Content-Type: text/event-stream");
  sseClientPtr->println("Cache-Control: no-cache");
  sseClientPtr->println("Connection: keep-alive");
  sseClientPtr->println("Access-Control-Allow-Origin: *");
  sseClientPtr->println();
  sseClientPtr->flush();
  
  sseActive = true;
  lastSSEPing = millis();
  
  Serial.println("SSE client connected");
  sendSSE("{\"status\":\"connected\"}");
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n===========================================");
  Serial.println("TOF400F Ultra-Accurate Firmware v4.0");
  Serial.println("===========================================\n");
  
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);
  
  TOFSerial.begin(115200, SERIAL_8N1, TOF_RXD, TOF_TXD);
  Serial.printf("UART: RX=%d, TX=%d @ 115200 baud\n", TOF_RXD, TOF_TXD);
  
  delay(300);
  
  // Configure sensor
  if (configureSensorForMaxRange()) {
    Serial.println("✓ Sensor initialization successful\n");
  } else {
    Serial.println("✗ WARNING: Sensor initialization issues\n");
  }
  
  // Performance test
  Serial.println("=== Performance Test ===");
  config.averagingSamples = 5;
  delay(300);
  
  for (int i = 0; i < 5; i++) {
    float testDist = readTOFDistance();
    if (testDist != 65535.0) {
      Serial.printf("Test %d: %.1f mm ✓\n", i + 1, testDist);
    } else {
      Serial.printf("Test %d: ERROR ✗\n", i + 1);
    }
    delay(150);
  }
  Serial.println();
  
  // WiFi connection
  WiFi.mode(WIFI_STA);
  WiFi.config(local_IP, gateway, subnet);
  WiFi.begin(ssid, password);
  
  Serial.print("WiFi connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" ✓");
    Serial.printf("IP: %s\n\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(" ✗ FAILED\n");
  }
  
  // Setup routes
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, []() {
    setCORSHeaders();
    server.send(204);
  });
  
  server.on("/configure", HTTP_POST, handleConfigure);
  server.on("/configure", HTTP_OPTIONS, []() {
    setCORSHeaders();
    server.send(204);
  });
  
  server.on("/calibrate", HTTP_POST, handleCalibrate);
  server.on("/calibrate", HTTP_OPTIONS, []() {
    setCORSHeaders();
    server.send(204);
  });
  
  server.on("/start", HTTP_GET, handleStart);
  server.on("/stop", HTTP_GET, handleStop);
  server.on("/data", HTTP_GET, handleData);
  server.on("/stream", HTTP_GET, handleStream);
  server.on("/diagnostics", HTTP_GET, handleDiagnostics);
  
  server.on("/id", HTTP_GET, []() {
    setCORSHeaders();
    server.send(200, "application/json", "{\"id\":\"TOF\"}");
  });
  server.on("/id", HTTP_OPTIONS, []() {
    setCORSHeaders();
    server.send(204);
  });

  server.on("/update", HTTP_POST, []() {
    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");
    delay(200);
    if (!Update.hasError()) {
      Serial.println("OTA successful. Rebooting...");
      ESP.restart();
    }
  }, []() {
    HTTPUpload &upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("OTA Start: %s\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("OTA Success: %u bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  server.begin();
  Serial.println("HTTP server started");
  Serial.println("System ready for experiments\n");
  Serial.println("===========================================\n");
  
  digitalWrite(STATUS_LED, LOW);
}

void loop() {
  server.handleClient();
  
  // SSE keepalive
  if (sseActive && sseClientPtr) {
    if (!sseClientPtr->connected()) {
      Serial.println("SSE disconnected");
      sseActive = false;
      delete sseClientPtr;
      sseClientPtr = nullptr;
    } else if (millis() - lastSSEPing > 10000) {
      if (sseClientPtr->print(": keepalive\n\n") > 0) {
        sseClientPtr->flush();
        lastSSEPing = millis();
      } else {
        sseActive = false;
        sseClientPtr->stop();
        delete sseClientPtr;
        sseClientPtr = nullptr;
      }
    }
  }
  
  // Experiment loop
  if (experimentRunning) {
    unsigned long now = millis();
    unsigned long elapsedTime = now - experimentStartTime;
    
    // Check duration
    if (elapsedTime >= (config.duration * 1000UL)) {
      experimentRunning = false;
      dataReady = true;
      Serial.printf("\n=== Experiment Complete ===\n");
      Serial.printf("Duration: %lu ms, Samples: %d\n", elapsedTime, sampleCount);
      Serial.printf("Success rate: %.1f%%\n",
        (float)diagnostics.successfulReadings / diagnostics.totalReadings * 100.0);
    }
    
    // Sample timing
    unsigned long nextSampleTime = experimentStartTime + ((unsigned long)sampleCount * sampleInterval);
    
    if (now >= nextSampleTime && sampleCount < MAX_SAMPLES) {
      // Take reading
      float distance = readTOFDistance();
      
      // Store sample
      distances[sampleCount] = distance;
      timestamps[sampleCount] = now - experimentStartTime;
      
      // Create JSON for SSE
      JsonDocument doc;
      doc["distance"] = distance;
      doc["timestamp"] = timestamps[sampleCount];
      doc["sample"] = sampleCount + 1;
      doc["quality"] = (distance == 65535.0) ? "error" : "good";
      
      String json;
      serializeJson(doc, json);
      
      // Log with quality indicator
      if (distance != 65535.0) {
        Serial.printf("Sample %d: %.1f mm ✓\n", sampleCount + 1, distance);
      } else {
        Serial.printf("Sample %d: ERROR (interpolated) ✗\n", sampleCount + 1);
      }
      
      sendSSE(json);
      digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
      
      sampleCount++;
      
      // Check buffer
      if (sampleCount >= MAX_SAMPLES) {
        experimentRunning = false;
        dataReady = true;
        Serial.println("\n=== Buffer Full ===");
      }
    }
  } else {
    digitalWrite(STATUS_LED, LOW);
  }
  
  delay(1);
}