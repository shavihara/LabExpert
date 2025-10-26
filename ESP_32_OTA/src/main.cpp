#include <WiFi.h>
#include <ArduinoJson.h>
#include "esp_ota_ops.h"
#include "Config.h"
#include "SensorManager.h"
#include "LEDManager.h"
#include "OTAManager.h"
#include "WebSocketManager.h"
#include "WebServerManager.h"



// Managers
SensorManager sensorManager;
LEDManager ledManager;
OTAManager otaManager;
WebSocketManager wsManager;
WebServerManager webServerManager;

String getDeviceIDFromMAC()
{
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return mac.substring(mac.length() - 5);
}

bool connectWiFi()
{
    WiFi.mode(WIFI_STA);
    if (!WiFi.config(LOCAL_IP, GATEWAY, SUBNET))
    {
        Serial.println("✘ WiFi config failed");
        return false;
    }

    WiFi.begin(SSID, PASSWORD);
    Serial.printf("Connecting to %s", SSID);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 15000)
    {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.printf("\n✓ WiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
        return true;
    }

    Serial.println("\n✘ WiFi connection failed");
    return false;
}

void handleWebSocketMessage(const JsonDocument &cmd)
{
    const char *cmdType = cmd["type"];
    if (cmdType && strcmp(cmdType, "disconnect_and_cleanup") == 0)
    {
        Serial.println("Received disconnect_and_cleanup command from backend");
        backendCleanupRequested = true;
    }
    else if (cmdType && strcmp(cmdType, "ping") == 0)
    {
        Serial.println("Received ping from backend");
        JsonDocument pongDoc;
        pongDoc["type"] = "pong";
        pongDoc["device_id"] = deviceID;
        String pongMsg;
        serializeJson(pongDoc, pongMsg);
        // Note: We can't send directly here, need to track WebSocket connection
    }
}

void setup()
{
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n🚀 ESP32 Sensor Manager Booting...");

    // Initialize hardware
    ledManager.begin();
    sensorManager.begin();

    // Detect sensor with retry logic
    if (!sensorManager.detect())
    {
        Serial.println("✘ Sensor not detected. Waiting for reconnection...");
        for (int i = 0; i < 3; i++)
        {
            delay(5000);
            if (sensorManager.detect())
            {
                Serial.println("✓ Sensor reconnected.");
                break;
            }
            Serial.printf("✘ Reconnection attempt %d/3 failed.\n", i + 1);
        }
        if (sensorManager.getType() == "UNKNOWN")
        {
            Serial.println("✘ Giving up. Rebooting...");
            delay(2000);
            ESP.restart();
        }
    }

    // Update global sensor state
    sensorType = sensorManager.getType();
    sensorID = sensorManager.getID();

    // Check partition and clean up
    const esp_partition_t *running = esp_ota_get_running_partition();
    if (running && strcmp(running->label, "ota_1") == 0 && sensorType == "UNKNOWN")
    {
        Serial.println("Sensor missing in UI mode - rebooting to bootloader");
        otaManager.eraseInactivePartition();
        delay(1000);
        ESP.restart();
    }

    otaManager.eraseInactivePartition();

    // Connect to WiFi
    if (!connectWiFi())
    {
        Serial.println("Entering configuration mode...");
        while (1)
            delay(1000);
    }

    // Initialize WebSocket
    deviceID = getDeviceIDFromMAC();
    Serial.printf("Device ID: %s\n", deviceID.c_str());

    wsManager.begin(deviceID, sensorType);
    wsManager.setMessageCallback(handleWebSocketMessage);

    // Initialize Web Server
    webServerManager.setSensorTypeCallback([]()
                                           { return sensorManager.getType(); });
    webServerManager.setSensorIDCallback([]()
                                         { return sensorManager.getID(); });
    webServerManager.begin();

    Serial.println("✓ System initialized successfully");
}

void loop()
{
    unsigned long currentTime = millis();

    // Handle all services
    webServerManager.handleClient();
    ledManager.updateWiFi(WiFi.status() == WL_CONNECTED);
    ledManager.updateSensor(sensorManager.getType() != "UNKNOWN");
    ledManager.handleBlinking();
    wsManager.loop();

    // Periodic sensor check
    if (sensorManager.shouldCheck(currentTime))
    {
        sensorManager.updateCheckTime(currentTime);
        sensorManager.detect();

        String currentType = sensorManager.getType();
        if (currentType != sensorType)
        {
            Serial.printf("Sensor change: %s -> %s\n", sensorType.c_str(), currentType.c_str());

            if (wsManager.isConnected())
            {
                wsManager.sendSensorID(currentType, WiFi.localIP().toString());
            }

            if (currentType == "UNKNOWN")
            {
                Serial.println("Sensor disconnected detected!");
                if (wsManager.isConnected())
                {
                    wsManager.sendSensorDisconnected();
                }
                Serial.println("Rebooting to bootloader...");
                otaManager.eraseInactivePartition();
                delay(1000);
                ESP.restart();
            }

            sensorType = currentType;
        }
    }

    // Handle backend cleanup request
    if (backendCleanupRequested)
    {
        Serial.println("Executing backend cleanup request");
        backendCleanupRequested = false;
        otaManager.eraseInactivePartition();
        delay(1000);
        ESP.restart();
    }

    // Handle WiFi reconnection
    static unsigned long lastWifiCheck = 0;
    if (currentTime - lastWifiCheck >= 5000)
    {
        lastWifiCheck = currentTime;
        if (WiFi.status() != WL_CONNECTED)
        {
            Serial.println("WiFi disconnected. Reconnecting...");
            WiFi.disconnect();
            connectWiFi();
        }
    }
}