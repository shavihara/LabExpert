#pragma once
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <functional>

class WebSocketManager {
public:
    void begin(const String &id, const String &sensorType);
    void loop();
    void sendSensorID(const String &sensorType, const String &ip);
    void sendSensorDisconnected();
    void setMessageCallback(std::function<void(const JsonDocument&)> callback);
    bool isConnected();

private:
    void handleEvent(WStype_t type, uint8_t *payload, size_t length);

    WebSocketsClient webSocket;
    String deviceID;
    String currentSensorType;
    std::function<void(const JsonDocument&)> messageCallback;
};