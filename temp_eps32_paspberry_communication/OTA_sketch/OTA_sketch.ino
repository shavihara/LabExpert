#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <Wire.h>
#include <ArduinoJson.h>

// EEPROM I2C Setup (24C02)
#define EEPROM_ADDR 0x50
#define EEPROM_SIZE 32

// LED Pins
#define WIFI_LED 2
#define SENSOR_LED 15

const char* ssid = "DT";
const char* password = "11111111";

WebServer server(80);

// EEPROM values
String sensorType = "UNKNOWN";
String sensorID = "N/A";

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(WIFI_LED, OUTPUT);
  pinMode(SENSOR_LED, OUTPUT);
  digitalWrite(WIFI_LED, HIGH);    // off (assuming active-low)
  digitalWrite(SENSOR_LED, HIGH);  // off

  Wire.begin(21, 22);  // I2C pins

  if (!readSensorEEPROM()) {
    Serial.println("Sensor detection failed. Rebooting...");
    delay(2000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.printf("Connecting to WiFi: %s\n", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");

  setupRoutes();
  server.begin();
  Serial.println("HTTP Server started");
}

void loop() {
  server.handleClient();
}

// EEPROM reader (detect sensor ID and type)
bool readSensorEEPROM() {
  Wire.beginTransmission(EEPROM_ADDR);
  if (Wire.endTransmission() != 0) return false;

  Wire.beginTransmission(EEPROM_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return false;

  Wire.requestFrom(EEPROM_ADDR, EEPROM_SIZE);
  if (Wire.available() < EEPROM_SIZE) return false;

  char buffer[EEPROM_SIZE + 1];
  for (int i = 0; i < EEPROM_SIZE; i++) buffer[i] = Wire.read();
  buffer[EEPROM_SIZE] = '\0';

  String data = String(buffer);
  sensorID = data.substring(0, 8);
  if (data.indexOf("OSI") >= 0) sensorType = "OSI";
  else if (data.indexOf("TOF") >= 0) sensorType = "TOF";
  else sensorType = "UNKNOWN";

  Serial.printf("EEPROM: %s\nSensor ID: %s, Type: %s\n", data.c_str(), sensorID.c_str(), sensorType.c_str());
  return true;
}

// OTA + Info routes
void setupRoutes() {
  server.on("/", HTTP_GET, []() {
    String html =
      "<h2>ESP32 OTA Upload</h2>"
      "<p>Sensor: " + sensorType + " (ID: " + sensorID + ")</p>"
      "<form method='POST' action='/update' enctype='multipart/form-data'>"
      "<input type='file' name='update'>"
      "<input type='submit' value='Upload'>"
      "</form>"
      "<hr><a href='/info'>Sensor Info (JSON)</a>";
    server.send(200, "text/html", html);
  });

  server.on("/update", HTTP_POST, []() {
    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");
    delay(100);
    if (!Update.hasError()) {
      Serial.println("Firmware updated successfully. Rebooting...");
      ESP.restart();
    }
  }, []() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("Update started: %s\n", upload.filename.c_str());
      if (!Update.begin()) Update.printError(Serial);
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("Update finished: %u bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  server.on("/info", HTTP_GET, []() {
    DynamicJsonDocument doc(256);
    doc["sensor_type"] = sensorType;
    doc["sensor_id"] = sensorID;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
}
