#pragma once
#include <WebServer.h>
#include <Update.h>
#include <ArduinoJson.h>

class WebServerManager {
public:
    void begin();
    void handleClient();
    void setSensorTypeCallback(std::function<String()> callback);
    void setSensorIDCallback(std::function<String()> callback);

private:
    WebServer server{80};
    std::function<String()> getSensorType;
    std::function<String()> getSensorID;
    
    void setupRoutes();
    void handleRoot();
    void handleUpdate();
    void handleUpload();
    void handleInfo();
    void handlePing();
    void handleID();
    void handleOTABegin();
    void handleOTAWrite();
    void handleOTAEnd();
};