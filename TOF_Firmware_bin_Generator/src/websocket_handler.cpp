#include "websocket_handler.h"
#include "sensor_communication.h"
#include "config_handler.h"
#include "experiment_manager.h"
#include <ArduinoJson.h>

// WebSocket instances
AsyncWebSocket ws("/ws");
WebSocketsClient backendWebSocket;

// WebSocket status
bool wsActive = false;
unsigned long lastWSPing = 0;

// Backend WebSocket Event Handler
void onBackendWsEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("✗ Backend WS disconnected");
            break;
        case WStype_CONNECTED: {
            Serial.println("✓ Backend WS connected");
            // Send sensor identification to backend
            String identMsg = "{\"type\":\"sensor_identify\",\"sensor_id\":\"" + sensorID + 
                           "\",\"sensor_type\":\"" + sensorType + 
                           "\",\"paired\":" + String(config.userPaired ? "true" : "false") + 
                           ",\"paired_user\":\"" + config.pairedUserID + "\"}";
            backendWebSocket.sendTXT(identMsg);
            Serial.println("Sent sensor identification: " + identMsg);
            break;
        }
        case WStype_TEXT: {
            Serial.printf("Backend WS received: %s\n", payload);
            
            // Parse JSON message to check for backend commands
            DynamicJsonDocument doc(512);
            DeserializationError error = deserializeJson(doc, payload, length);
            if (!error) {
                const char* cmdType = doc["type"];
                
                if (cmdType && strcmp(cmdType, "config_update") == 0) {
                    // Handle configuration updates from backend
                    const char* userID = doc["user_id"];
                    
                    // Validate user pairing for configuration changes
                    if (!config.userPaired || strcmp(config.pairedUserID.c_str(), userID) != 0) {
                        Serial.printf("Rejected config update from unauthorized user: %s\n", userID);
                        return;
                    }
                    
                    // Update sensor configuration
                    if (doc.containsKey("frequency")) {
                        config.frequency = doc["frequency"];
                    }
                    if (doc.containsKey("maxRange")) {
                        config.maxRange = doc["maxRange"];
                    }
                    if (doc.containsKey("duration")) {
                        config.duration = doc["duration"];
                    }
                    if (doc.containsKey("averagingSamples")) {
                        config.averagingSamples = doc["averagingSamples"];
                    }
                    if (doc.containsKey("mode")) {
                        config.mode = doc["mode"].as<String>();
                    }
                    
                    Serial.println("Configuration updated from backend");
                    
                    // Apply configuration to sensor
                    configureSensorForMaxRange(config.maxRange);
                    
                } else if (cmdType && strcmp(cmdType, "command") == 0) {
                    const char* cmd = doc["cmd"];
                    if (cmd && strcmp(cmd, "disconnect_and_cleanup") == 0) {
                        Serial.println("Received disconnect_and_cleanup command from backend");
                        backendCleanupRequested = true;
                        Serial.println("Cleanup flag set - will execute in main loop");
                    }
                }
            }
            break;
        }
        case WStype_ERROR:
            Serial.println("✗ Backend WS error");
            break;
    }
}

// Local WebSocket Event Handler
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("WS Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
        wsActive = true;
        
        // Send current sensor status and pairing information
        String statusMsg = "{\"type\":\"sensor_status\",\"sensor_id\":\"" + sensorID + 
                          "\",\"sensor_type\":\"" + sensorType + 
                          "\",\"paired\":" + String(config.userPaired ? "true" : "false") + 
                          "\",\"paired_user\":\"" + config.pairedUserID + "\"}";
        client->text(statusMsg);
        
    } else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("WS Client #%u disconnected\n", client->id());
        wsActive = (ws.count() > 0);
    } else if (type == WS_EVT_DATA) {
        AwsFrameInfo *info = (AwsFrameInfo*)arg;
        if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
            data[len] = 0;
            String message = (char*)data;
            Serial.printf("WS Received: %s\n", message.c_str());

            DynamicJsonDocument doc(512);
            deserializeJson(doc, message);
            String cmdType = doc["type"];
            
            // Handle user pairing commands
            if (cmdType == "pair_user") {
                String userID = doc["user_id"];
                config.pairedUserID = userID;
                config.userPaired = true;
                
                Serial.printf("Sensor paired with user: %s\n", userID.c_str());
                String response = "{\"type\":\"pairing_status\",\"success\":true,\"user_id\":\"" + userID + "\"}";
                client->text(response);
                
                // Notify backend about pairing
                if (backendWebSocket.isConnected()) {
                    String backendMsg = "{\"type\":\"user_pairing\",\"sensor_id\":\"" + sensorID + 
                                       "\",\"user_id\":\"" + userID + "\",\"action\":\"paired\"}";
                    backendWebSocket.sendTXT(backendMsg);
                }
                
            } else if (cmdType == "unpair_user") {
                config.pairedUserID = "";
                config.userPaired = false;
                
                Serial.println("Sensor unpaired from user");
                String response = "{\"type\":\"pairing_status\",\"success\":true,\"action\":\"unpaired\"}";
                client->text(response);
                
                // Notify backend about unpairing
                if (backendWebSocket.isConnected()) {
                    String backendMsg = "{\"type\":\"user_pairing\",\"sensor_id\":\"" + sensorID + 
                                       "\",\"action\":\"unpaired\"}";
                    backendWebSocket.sendTXT(backendMsg);
                }
                
            } else if (cmdType == "sensor_command") {
                // Validate user pairing before executing commands
                String userID = doc["user_id"];
                String cmd = doc["cmd"];
                
                if (!config.userPaired || config.pairedUserID != userID) {
                    // Reject command if not from paired user
                    String errorMsg = "{\"type\":\"command_error\",\"error\":\"unauthorized\",\"message\":\"Sensor not paired with this user\"}";
                    client->text(errorMsg);
                    Serial.printf("Rejected command from unauthorized user: %s\n", userID.c_str());
                    return;
                }
                
                // Execute authorized commands
                if (cmd == "start") {
                    experimentRunning = true;
                    experimentStartTime = millis();
                    sampleCount = 0;
                    Serial.println("Experiment started via WS");
                    String response = "{\"type\":\"command_status\",\"cmd\":\"start\",\"status\":\"started\"}";
                    client->text(response);
                    
                } else if (cmd == "pause") {
                    experimentRunning = false;
                    Serial.println("Experiment paused via WS");
                    String response = "{\"type\":\"command_status\",\"cmd\":\"pause\",\"status\":\"paused\"}";
                    client->text(response);
                    
                } else if (cmd == "resume") {
                    experimentRunning = true;
                    Serial.println("Experiment resumed via WS");
                    String response = "{\"type\":\"command_status\",\"cmd\":\"resume\",\"status\":\"resumed\"}";
                    client->text(response);
                    
                } else if (cmd == "stop") {
                    experimentRunning = false;
                    dataReady = true;
                    Serial.println("Experiment stopped via WS");
                    String response = "{\"type\":\"command_status\",\"cmd\":\"stop\",\"status\":\"stopped\"}";
                    client->text(response);
                    
                } else if (cmd == "disconnect") {
                    // Handle graceful disconnect
                    Serial.println("Disconnect command received");
                    String response = "{\"type\":\"command_status\",\"cmd\":\"disconnect\",\"status\":\"disconnected\"}";
                    client->text(response);
                    client->close();
                }
            }
        }
    } else if (type == WS_EVT_PONG) {
        Serial.printf("WS Pong received from client #%u\n", client->id());
    }
}

// Send data to WebSocket
void sendWS(const String& data) {
    if (wsActive && ws.count() > 0) {
        ws.textAll(data);
        lastWSPing = millis();
    }
}