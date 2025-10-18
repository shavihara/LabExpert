#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include "esp_partition.h"
#include "esp_ota_ops.h"

// GPIO pin setup
#define WIFI_LED 2
#define SENSOR_LED 15

// EEPROM config
#define EEPROM_SENSOR_ADDR 0x50
#define EEPROM_SIZE 3 // Only read 3 bytes for sensor type

// Wi-Fi credentials
const char *ssid = "DT";
const char *password = "11111111";
IPAddress local_IP(192, 168, 137, 15);
IPAddress gateway(192, 168, 137, 1);
IPAddress subnet(255, 255, 255, 0);

// Web server
WebServer server(80);

// Sensor info
String sensorType = "UNKNOWN";
String sensorID = "N/A";

// LED blink state
unsigned long previousWifiLedMillis = 0;
unsigned long previousSensorLedMillis = 0;
const unsigned long ledInterval = 3000;
bool wifiLedState = false;
bool sensorLedState = false;

// Retry mechanism for EEPROM detection
#define EEPROM_RETRY_COUNT 3
#define EEPROM_RETRY_DELAY 1000 // 1 second between retries

// ========== Erase inactive OTA partition ==========
void eraseInactivePartition()
{
  const esp_partition_t *running = esp_ota_get_running_partition();
  const esp_partition_t *ota_0 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
  const esp_partition_t *ota_1 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);

  const esp_partition_t *inactive = (running == ota_0) ? ota_1 : ota_0;

  if (inactive)
  {
    Serial.printf("Erasing inactive partition: %s\n", inactive->label);
    esp_err_t err = esp_partition_erase_range(inactive, 0, inactive->size);
    if (err == ESP_OK)
    {
      Serial.println("✓ Inactive partition erased successfully.");
    }
    else
    {
      Serial.printf("✘ Failed to erase inactive partition. Error: %d\n", err);
    }
  }
  else
  {
    Serial.println("✘ Could not find inactive OTA partition.");
  }
}

// ========== Detect sensor from EEPROM ==========
bool detectSensor()
{
  for (int retry = 0; retry < EEPROM_RETRY_COUNT; retry++)
  {
    Wire.beginTransmission(EEPROM_SENSOR_ADDR);
    int error = Wire.endTransmission();
    if (error == 0)
    {
      Wire.beginTransmission(EEPROM_SENSOR_ADDR);
      Wire.write(0x00);
      if (Wire.endTransmission(false) == 0)
      {
        Wire.requestFrom(EEPROM_SENSOR_ADDR, EEPROM_SIZE);
        if (Wire.available() >= EEPROM_SIZE)
        {
          char buffer[EEPROM_SIZE + 1];
          for (int i = 0; i < EEPROM_SIZE; i++)
          {
            buffer[i] = Wire.read();
          }
          buffer[EEPROM_SIZE] = '\0';
          String eepromData = String(buffer);
          Serial.printf("EEPROM data: %s\n", eepromData.c_str());

          if (eepromData == "OSI")
          {
            sensorType = "OSI";
          }
          else if (eepromData == "TOF")
          {
            sensorType = "TOF";
          }
          else
          {
            sensorType = "UNKNOWN";
          }
          Serial.printf("Sensor Type: %s, ID: %s\n", sensorType.c_str(), sensorID.c_str());
          return (sensorType != "UNKNOWN");
        }
        else
        {
          Serial.println("✘ Not enough data from EEPROM");
        }
      }
      else
      {
        Serial.println("✘ Failed to set EEPROM address");
      }
    }
    else
    {
      Serial.printf("✘ EEPROM sensor not found, I2C error: %d\n", error);
    }
    if (retry < EEPROM_RETRY_COUNT - 1)
    {
      Serial.printf("Retrying EEPROM detection (%d/%d)...\n", retry + 1, EEPROM_RETRY_COUNT);
      delay(EEPROM_RETRY_DELAY);
    }
  }
  return false;
}

// ========== Wi-Fi LED status ==========
void handleWifiLed()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    unsigned long now = millis();
    if (now - previousWifiLedMillis >= ledInterval)
    {
      previousWifiLedMillis = now;
      wifiLedState = !wifiLedState;
      digitalWrite(WIFI_LED, wifiLedState ? LOW : HIGH);
    }
  }
  else
  {
    digitalWrite(WIFI_LED, LOW); // solid ON when disconnected
  }
}

// ========== Sensor LED status ==========
void handleSensorLed()
{
  unsigned long now = millis();
  if (sensorType != "UNKNOWN")
  {
    if (now - previousSensorLedMillis >= ledInterval)
    {
      previousSensorLedMillis = now;
      sensorLedState = !sensorLedState;
      digitalWrite(SENSOR_LED, sensorLedState ? LOW : HIGH);
    }
  }
  else
  {
    digitalWrite(SENSOR_LED, LOW); // solid ON if no sensor
  }
}

// ========== Web server routes ==========
void setupRoutes()
{
  server.on("/", HTTP_GET, []()
            {
    String html =
      "<h1>ESP32 OTA Manager</h1>"
      "<p>Sensor: " + sensorType + " (ID: " + sensorID + ")</p>"
      "<form method='POST' action='/update' enctype='multipart/form-data'>"
      "<input type='file' name='update'>"
      "<input type='submit' value='Upload Firmware'>"
      "</form>"
      "<hr><p><a href='/info'>Sensor Info (JSON)</a></p>";
    server.send(200, "text/html", html); });

  server.on("/update", HTTP_POST, []()
            {
    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");
    delay(200);
    if (!Update.hasError()) {
      Serial.println("✓ Update successful. Rebooting...");
      const esp_partition_t *running = esp_ota_get_running_partition();
      const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
      Serial.printf("Running partition: %s\n", running->label);
      Serial.printf("Updated partition: %s\n", next->label);
      ESP.restart();
    } }, []()
            {
    HTTPUpload &upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("Update Start: %s\n", upload.filename.c_str());
      const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
      Serial.printf("Writing to partition: %s\n", next->label);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("Update Success: %u bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    } });

  server.on("/info", HTTP_GET, []()
            {
    DynamicJsonDocument doc(256);
    doc["sensor_type"] = sensorType;
    doc["sensor_id"] = sensorID;
    String jsonResp;
    serializeJson(doc, jsonResp);
    server.send(200, "application/json", jsonResp); });

  server.on("/id", HTTP_GET, []()
            {
    DynamicJsonDocument doc(256);
    doc["id"] = sensorType; // Use sensorType as ID for firmware selection
    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json); });
}

// ========== Setup ==========
void setup()
{
  Serial.begin(115200);
  const esp_partition_t *running = esp_ota_get_running_partition();
  Serial.printf("Booting from partition: %s\n", running->label);
  Serial.println("OTA Bootloader Starting...");

  pinMode(WIFI_LED, OUTPUT);
  pinMode(SENSOR_LED, OUTPUT);
  digitalWrite(WIFI_LED, HIGH);
  digitalWrite(SENSOR_LED, HIGH);

  Wire.begin(21, 22); // SDA, SCL

  if (!detectSensor())
  {
    Serial.println("✘ Sensor not detected. Waiting for reconnection...");
    for (int i = 0; i < 3; i++)
    {
      delay(5000); // Wait 5 seconds per attempt
      if (detectSensor())
      {
        Serial.println("✓ Sensor reconnected.");
        break;
      }
      Serial.printf("✘ Reconnection attempt %d/3 failed.\n", i + 1);
    }
    if (sensorType == "UNKNOWN")
    {
      Serial.println("✘ Giving up. Rebooting...");
      delay(2000);
      esp_restart();
    }
  }

  // Erase inactive partition to allow clean OTA
  eraseInactivePartition();

  WiFi.mode(WIFI_STA);
  if (!WiFi.config(local_IP, gateway, subnet))
  {
    Serial.println("✘ Failed to configure static IP");
  }
  WiFi.begin(ssid, password);
  Serial.printf("Connecting to WiFi SSID: %s\n", ssid);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\n✓ Connected to WiFi, IP: ");
  Serial.println(WiFi.localIP());

  setupRoutes();
  server.begin();
  Serial.println("✓ OTA Server ready.");
}

// ========== Main Loop ==========
void loop()
{
  server.handleClient();
  handleWifiLed();
  handleSensorLed();

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("✘ WiFi lost. Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    delay(5000);
  }
}