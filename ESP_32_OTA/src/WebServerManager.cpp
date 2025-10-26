#include "WebServerManager.h"
#include "Config.h"
#include "OTAManager.h"

// OTA state (kept here for HTTP OTA)
bool otaInProgress = false;
size_t otaExpectedSize = 0;
size_t otaWritten = 0;

void WebServerManager::setSensorTypeCallback(std::function<String()> callback) {
    getSensorType = callback;
}

void WebServerManager::setSensorIDCallback(std::function<String()> callback) {
    getSensorID = callback;
}

void WebServerManager::begin() {
    setupRoutes();
    server.begin();
    Serial.println("✓ HTTP Server ready on port 80");
}

void WebServerManager::handleClient() {
    server.handleClient();
}

void WebServerManager::setupRoutes() {
    server.on("/", HTTP_GET, [this]() { this->handleRoot(); });
    server.on("/update", HTTP_POST, [this]() { this->handleUpdate(); }, [this]() { this->handleUpload(); });
    server.on("/info", HTTP_GET, [this]() { this->handleInfo(); });
    server.on("/ping", HTTP_GET, [this]() { this->handlePing(); });
    server.on("/id", HTTP_GET, [this]() { this->handleID(); });
    server.on("/ota/begin", HTTP_POST, [this]() { this->handleOTABegin(); });
    server.on("/ota/write", HTTP_POST, [this]() { this->handleOTAWrite(); });
    server.on("/ota/end", HTTP_POST, [this]() { this->handleOTAEnd(); });
}

void WebServerManager::handleRoot() {
    String sensorType = getSensorType ? getSensorType() : "UNKNOWN";
    String sensorID = getSensorID ? getSensorID() : "N/A";
    
    String html = "<h1>ESP32 OTA Manager</h1>"
                  "<p>Sensor: " + sensorType + " (ID: " + sensorID + ")</p>"
                  "<form method='POST' action='/update' enctype='multipart/form-data'>"
                  "<input type='file' name='update'>"
                  "<input type='submit' value='Upload Firmware'>"
                  "</form>"
                  "<hr><p><a href='/info'>Sensor Info (JSON)</a></p>";
    server.send(200, "text/html", html);
}

void WebServerManager::handleUpdate() {
    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");
    delay(200);
    if (!Update.hasError()) {
        Serial.println("✓ Update successful. Rebooting...");
        ESP.restart();
    }
}

void WebServerManager::handleUpload() {
    HTTPUpload &upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
        Serial.printf("Update Start: %s\n", upload.filename.c_str());
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
    }
}

void WebServerManager::handleInfo() {
    JsonDocument doc;
    doc["sensor_type"] = getSensorType ? getSensorType() : "UNKNOWN";
    doc["sensor_id"] = getSensorID ? getSensorID() : "N/A";
    String jsonResp;
    serializeJson(doc, jsonResp);
    server.send(200, "application/json", jsonResp);
}

void WebServerManager::handlePing() {
    server.send(200, "text/plain", "pong");
}

void WebServerManager::handleID() {
    JsonDocument doc;
    doc["id"] = getSensorType ? getSensorType() : "UNKNOWN";
    String json;
    serializeJson(doc, json);
    server.send(200, "application/json", json);
}

void WebServerManager::handleOTABegin() {
    String body = server.arg("plain");
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"bad_json\"}");
        return;
    }
    size_t size = doc["size"] | 0;
    if (!Update.begin(size)) {
        server.send(500, "application/json", "{\"success\":false}");
        return;
    }
    otaInProgress = true;
    otaExpectedSize = size;
    otaWritten = 0;
    server.send(200, "application/json", "{\"success\":true}");
}

void WebServerManager::handleOTAWrite() {
    String body = server.arg("plain");
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"bad_json\"}");
        return;
    }
    size_t offset = doc["offset"] | 0;
    size_t size = doc["size"] | 0;
    String hex = doc["data"] | "";
    std::vector<uint8_t> bytes;
    if (!OTAManager::hexToBytes(hex, bytes)) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"bad_hex\"}");
        return;
    }
    if (bytes.size() != size) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"size_mismatch\"}");
        return;
    }
    if (!otaInProgress) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"not_in_progress\"}");
        return;
    }
    size_t written = Update.write(bytes.data(), bytes.size());
    if (written != bytes.size()) {
        server.send(500, "application/json", "{\"success\":false}");
        return;
    }
    otaWritten += written;
    server.send(200, "application/json", "{\"success\":true}");
}

void WebServerManager::handleOTAEnd() {
    if (!otaInProgress) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"not_in_progress\"}");
        return;
    }
    bool ok = Update.end(true);
    if (ok) {
        server.send(200, "application/json", "{\"success\":true}");
        delay(200);
        ESP.restart();
    } else {
        server.send(500, "application/json", "{\"success\":false}");
    }
    otaInProgress = false;
}