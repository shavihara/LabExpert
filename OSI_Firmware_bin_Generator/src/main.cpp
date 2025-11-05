#include <WiFi.h>
#include <ArduinoJson.h>
#include "esp_partition.h"
#include "esp_ota_ops.h"
#include <Wire.h>

// Include modular headers
#include "config_handler.h"
#include "sensor_communication.h"
#include "experiment_manager.h"
#include "mqtt_handler.h"

// Network configuration
const char *ssid = "LabExpert_1.0";
const char *password = "11111111";
IPAddress local_IP(192, 168, 137, 15);
IPAddress gateway(192, 168, 137, 1);
IPAddress subnet(255, 255, 255, 0);

// Initialize I2C buses
#if !defined(EEPROM_SDA)
#define EEPROM_SDA 18
#endif
#if !defined(EEPROM_SCL)
#define EEPROM_SCL 19
#endif

void setup()
{
    Serial.begin(115200);
    Serial.println("\n=== Oscillation Counter System ===");

    // Initialize I2C buses
    Wire.begin(EEPROM_SDA, EEPROM_SCL);

    Serial.printf("I2C Initialized: SDA=%d, SCL=%d\n", EEPROM_SDA, EEPROM_SCL);

    // Initialize pins
    pinMode(SENSOR_LED, OUTPUT);
    pinMode(WIFI_LED, OUTPUT);
    pinMode(SENSOR_PIN, INPUT);
    digitalWrite(SENSOR_LED, LOW);
    digitalWrite(WIFI_LED, HIGH);

    // Network setup
    WiFi.mode(WIFI_STA);
    WiFi.config(local_IP, gateway, subnet);
    WiFi.begin(ssid, password);

    Serial.print("Connecting to WiFi");
    int wifiAttempts = 0;
    while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20)
    {
        delay(500);
        Serial.print(".");
        wifiAttempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.printf("\nWiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());

        // Detect sensor from EEPROM
        bool sensorDetected = detectSensorFromEEPROM();

        if (!sensorDetected)
        {
            Serial.println("❌ EEPROM not detected!");
            delay(3000);
            ESP.restart();
        }

        // Get device ID (this will set sensorID variable)
        getDeviceIDFromMAC();

        Serial.printf("Detected sensor type: %s\n", sensorType.c_str());
        Serial.printf("Device ID: %s\n", sensorID.c_str());

        // Initialize MQTT connection
        setupMQTT();
        Serial.println("MQTT configured");

        // Blink WiFi LED once to indicate successful connection
        digitalWrite(WIFI_LED, LOW);
        delay(100);
        digitalWrite(WIFI_LED, HIGH);
        delay(100);
        digitalWrite(WIFI_LED, LOW);
    }
    else
    {
        Serial.println("\nWiFi connection failed!");
        digitalWrite(WIFI_LED, HIGH);
    }

    Serial.println("System initialized - Waiting for start command");
}

void updateWiFiLED()
{
    static unsigned long lastWiFiBlink = 0;

    if (WiFi.status() != WL_CONNECTED)
    {
        digitalWrite(WIFI_LED, HIGH);
    }
    else
    {
        if (millis() - lastWiFiBlink >= 5000)
        {
            digitalWrite(WIFI_LED, HIGH);
            delay(50);
            digitalWrite(WIFI_LED, LOW);
            lastWiFiBlink = millis();
        }
    }
}

void loop()
{
    updateWiFiLED();
    checkSensorStatus();
    handleBackendCleanup();
    mqttLoop();
    manageExperimentLoop();
    delay(1);
}