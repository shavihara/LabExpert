#include "WebSocketManager.h"
#include "Config.h"
#include <WiFi.h>

void WebSocketManager::begin(const String &id, const String &sensorType) {
    deviceID = id;
    currentSensorType = sensorType;
    webSocket.begin(BACKEND_HOST, BACKEND_PORT, String(WS_ENDPOINT) + "?device_id=" + deviceID);
    webSocket.onEvent([this](WStype_t type, uint8_t *payload, size_t length) {
        this->handleEvent(type, payload, length);
    });
    webSocket.setReconnectInterval(WS_RECONNECT_INTERVAL);
}

void WebSocketManager::loop() {
    webSocket.loop();
}

void WebSocketManager::sendSensorID(const String &sensorType, const String &ip) {
    JsonDocument doc;
    doc["type"] = "sensor_id";
    doc["sensor_id"] = sensorType;
    doc["device_id"] = deviceID;
    doc["ip"] = ip;
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
    Serial.printf("Sent sensor_id: %s\n", output.c_str());
}

void WebSocketManager::sendSensorDisconnected() {
    JsonDocument doc;
    doc["type"] = "sensor_disconnected";
    doc["device_id"] = deviceID;
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
    Serial.printf("Sent sensor_disconnected: %s\n", output.c_str());
}

void WebSocketManager::setMessageCallback(std::function<void(const JsonDocument&)> callback) {
    messageCallback = callback;
}

bool WebSocketManager::isConnected() {
    return webSocket.isConnected();
}

void WebSocketManager::handleEvent(WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED: {
            Serial.println("✓ WebSocket connected to backend");
            // Send device identification to backend immediately upon connection
            JsonDocument doc;
            doc["type"] = "sensor_id";
            doc["sensor_id"] = currentSensorType;
            doc["device_id"] = deviceID;
            doc["ip"] = WiFi.localIP().toString();
            
            String output;
            serializeJson(doc, output);
            webSocket.sendTXT(output);
            Serial.printf("Sent device identification: %s\n", output.c_str());
            break;
        }
            
        case WStype_TEXT: {
            Serial.printf("WS RX: %.*s\n", (int)length, (const char*)payload);
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload, length);
            if (err) {
                Serial.printf("WS JSON error: %s\n", err.c_str());
                return;
            }
            
            if (messageCallback) {
                messageCallback(doc);
            }
            break;
        }
            
        case WStype_DISCONNECTED:
            Serial.println("✘ WebSocket disconnected");
            break;
            
        default:
            break;
    }
}