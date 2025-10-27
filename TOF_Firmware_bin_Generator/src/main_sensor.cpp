// TOF400F Firmware - Modular Refactored Version
// Main entry point that connects all modular components

#include <WiFi.h>
#include <ArduinoJson.h>
#include "esp_partition.h"
#include "esp_ota_ops.h"
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <Update.h>
#include <Wire.h>
#include <WebSocketsClient.h>

// Include modular headers
#include "../include/sensor_communication.h"
#include "../include/websocket_handler.h"
#include "../include/config_handler.h"
#include "../include/experiment_manager.h"

// Hardware configuration
#define STATUS_LED 2
#define TOF_RXD 16
#define TOF_TXD 17

// Network configuration
const char *ssid = "LabExpert_1.0";
const char *password = "11111111";
IPAddress local_IP(192, 168, 137, 15);
IPAddress gateway(192, 168, 137, 1);
IPAddress subnet(255, 255, 255, 0);

// Backend WebSocket configuration
const char* backendHost = "192.168.137.1"; // Backend server IP
const uint16_t backendPort = 5000;

// Hardware serial for TOF sensor
HardwareSerial TOFSerial(2);

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== TOF400F Firmware - Modular Refactored Version ===");
    
    // Initialize I2C for EEPROM
    Wire.begin();
    
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, HIGH);
    
    // Initialize TOF serial communication for TOF 400F Sensor
    // Sensor TX -> ESP32 GPIO16 (TOF_RXD), Sensor RX -> ESP32 GPIO17 (TOF_TXD)
    TOFSerial.begin(115200, SERIAL_8N1, TOF_RXD, TOF_TXD);
    Serial.printf("TOF 400F Sensor UART configured - RX: GPIO%d, TX: GPIO%d @ 115200 baud\n", TOF_RXD, TOF_TXD);
    
    delay(300);
    
    // Configure sensor for maximum range
    if (configureSensorForMaxRange(8000)) {
        Serial.println("Sensor initialization successful");
    } else {
        Serial.println("WARNING: Sensor init issues");
    }
    
    // Network setup
    WiFi.mode(WIFI_STA);
    WiFi.config(local_IP, gateway, subnet);
    WiFi.begin(ssid, password);
    
    Serial.print("Connecting to WiFi");
    int wifiAttempts = 0;
    while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
        delay(500); Serial.print("."); wifiAttempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\nWiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
        
        // Detect sensor from EEPROM
        bool sensorDetected = detectSensorFromEEPROM();
        sensorWasPresent = sensorDetected;
        Serial.printf("Detected sensor type: %s\n", sensorType.c_str());
        
        // Get device ID from MAC address
        sensorID = getDeviceIDFromMAC();
        Serial.printf("Device ID: %s\n", sensorID.c_str());
        
        // Initialize backend WebSocket connection
        backendWebSocket.begin(backendHost, backendPort, String("/ws/device?device_id=") + sensorID);
        backendWebSocket.onEvent(onBackendWsEvent);
        Serial.printf("Connecting to backend at %s:%d\n", backendHost, backendPort);
        
    } else {
        Serial.println("\nWiFi connection failed!");
    }
    
    // Setup WebSocket
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    
    // Setup HTTP routes
    server.on("/status", HTTP_GET, handleStatus);
    server.on("/configure", HTTP_POST, handleConfigure);
    server.on("/calibrate", HTTP_POST, handleCalibrate);
    server.on("/start", HTTP_GET, handleStart);
    server.on("/stop", HTTP_GET, handleStop);
    server.on("/data", HTTP_GET, handleData);
    server.on("/id", HTTP_GET, handleId);
    
    // OTA update
    server.on("/update", HTTP_POST, handleUpdate, handleUpdateUpload);
    
    // CORS handling
    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            request->send(200);
        } else {
            request->send(404);
        }
    });
    
    server.begin();
    Serial.println("HTTP/WS server started");
    digitalWrite(STATUS_LED, LOW);
}

void loop() {
    // WebSocket maintenance
    ws.cleanupClients();
    backendWebSocket.loop();
    
    if (wsActive && (millis() - lastWSPing > 30000)) {
        ws.pingAll();
        lastWSPing = millis();
    }

    // Check sensor status periodically
    checkSensorStatus();
    
    // Manage experiment execution
    manageExperimentLoop();
    
    // Handle backend cleanup requests
    handleBackendCleanup();
    
    delay(1);
}