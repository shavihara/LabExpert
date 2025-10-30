#include "mqtt_handler.h"
#include "sensor_communication.h"
#include "config_handler.h"
#include "experiment_manager.h"
#include <WiFi.h>
#include <algorithm>

// MQTT client
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// MQTT configuration (defined in main_sensor.cpp)
extern const char* mqttBroker;
extern const uint16_t mqttPort;

// MQTT status
bool mqttConnected = false;

void setupMQTT() {
    mqttClient.setServer(mqttBroker, mqttPort);
    mqttClient.setCallback(mqttCallback);
    
    Serial.println("MQTT client configured");
}

void reconnectMQTT() {
    // Loop until we're reconnected
    while (!mqttClient.connected()) {
        Serial.print("Attempting MQTT connection...");
        
        // Create a client ID with sensor ID
        String clientId = "ESP32_" + sensorID;
        
        // Attempt to connect
        if (mqttClient.connect(clientId.c_str())) {
            Serial.println("connected");
            mqttConnected = true;
            
            // Subscribe to config and command topics with QoS 1 to match backend
            char configTopic[50];
            snprintf(configTopic, sizeof(configTopic), MQTT_CONFIG_TOPIC, sensorID.c_str());
            mqttClient.subscribe(configTopic, 1); // QoS 1
            
            char commandTopic[50];
            snprintf(commandTopic, sizeof(commandTopic), MQTT_COMMAND_TOPIC, sensorID.c_str());
            mqttClient.subscribe(commandTopic, 1); // QoS 1
            
            Serial.printf("Subscribed to: %s and %s\n", configTopic, commandTopic);
            
            // Publish sensor identification
            publishSensorIdentification();
            
        } else {
            Serial.print("failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(" try again in 5 seconds");
            
            // Wait 5 seconds before retrying
            delay(5000);
        }
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.printf("Message arrived [%s]\n", topic);
    Serial.printf("Payload length: %d\n", length);
    
    // Log raw payload for debugging
    Serial.print("Raw payload: ");
    for (unsigned int i = 0; i < min(length, 50u); i++) {
        if (payload[i] >= 32 && payload[i] <= 126) {
            Serial.print((char)payload[i]);
        } else {
            Serial.printf("\\x%02X", payload[i]);
        }
    }
    Serial.println();
    
    // Handle different topic types
    String topicStr = String(topic);
    
    if (topicStr.endsWith("/config")) {
        Serial.println("Config topic detected - processing...");
        handleMQTTCommands(topic, payload, length);
    } else if (topicStr.endsWith("/command")) {
        Serial.println("Command topic detected - processing...");
        handleMQTTCommands(topic, payload, length);
    } else {
        Serial.println("Unknown topic type");
    }
}

void handleMQTTCommands(char* topic, byte* payload, unsigned int length) {
    // Create a buffer for the payload
    char message[length + 1];
    memcpy(message, payload, length);
    message[length] = '\0';
    
    Serial.printf("Received MQTT message: %s\n", message);
    Serial.printf("Raw payload (first 20 bytes): ");
    for (unsigned int i = 0; i < min(length, 20u); i++) {
        Serial.printf("%02X ", payload[i]);
    }
    Serial.println();
    
    // Parse JSON message
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("JSON parse error: %s\n", error.c_str());
        return;
    }
    
    // Handle different command types
    String topicStr = String(topic);
    
    if (topicStr.endsWith("/config")) {
        // Handle configuration updates
        if (doc.containsKey("freq")) {
            config.frequency = doc["freq"];
            Serial.printf("Frequency updated to: %d\n", config.frequency);
        }
        
        if (doc.containsKey("maxRange")) {
            config.maxRange = doc["maxRange"];
            configureSensorForMaxRange(config.maxRange);
            Serial.printf("Max range updated to: %d\n", config.maxRange);
        }
        
        if (doc.containsKey("duration")) {
            config.duration = doc["duration"];
            Serial.printf("Duration updated to: %d\n", config.duration);
        }
        
        if (doc.containsKey("averagingSamples")) {
            config.averagingSamples = doc["averagingSamples"];
            Serial.printf("Averaging samples updated to: %d\n", config.averagingSamples);
        }
        
        publishStatus("config_updated", "Configuration updated successfully");
        
    } else if (topicStr.endsWith("/command")) {
        // Handle command messages
        const char* command = doc["command"];
        
        if (strcmp(command, "start_experiment") == 0) {
            experimentRunning = true;
            experimentStartTime = millis();
            sampleCount = 0;
            Serial.println("Experiment started via MQTT");
            publishStatus("experiment_started");
            
        } else if (strcmp(command, "stop_experiment") == 0) {
            experimentRunning = false;
            dataReady = true;
            Serial.println("Experiment stopped via MQTT");
            publishStatus("experiment_stopped");
            
        } else if (strcmp(command, "pause_experiment") == 0) {
            experimentRunning = false;
            Serial.println("Experiment paused via MQTT");
            publishStatus("experiment_paused");
            
        } else if (strcmp(command, "resume_experiment") == 0) {
            experimentRunning = true;
            Serial.println("Experiment resumed via MQTT");
            publishStatus("experiment_resumed");
            
        } else if (strcmp(command, "disconnect_device") == 0) {
            Serial.println("Disconnect command received - cleaning firmware and booting to OTA");
            publishStatus("disconnecting", "Device disconnecting and booting to OTA");
            
            // Clean up and prepare for OTA boot
            delay(1000); // Give time for status message to be sent
            
            // Clean firmware partition and boot to OTA
            cleanFirmwareAndBootOTA();
        }
    }
}

void publishSensorData(uint32_t timestamp, uint16_t distance, uint16_t sampleNumber) {
    if (!mqttClient.connected()) {
        return;
    }
    
    // Create JSON payload
    DynamicJsonDocument doc(128);
    doc["timestamp"] = timestamp;
    doc["distance"] = distance;
    doc["sample"] = sampleNumber;
    doc["sensor_id"] = sensorID;
    doc["sensor_type"] = sensorType;
    
    String payload;
    serializeJson(doc, payload);
    
    // Publish to data topic
    char dataTopic[50];
    snprintf(dataTopic, sizeof(dataTopic), MQTT_DATA_TOPIC, sensorID.c_str());
    
    mqttClient.publish(dataTopic, payload.c_str());
}

void publishStatus(const char* status, const char* message) {
    if (!mqttClient.connected()) {
        return;
    }
    
    // Create JSON payload
    DynamicJsonDocument doc(256);
    doc["status"] = status;
    doc["sensor_id"] = sensorID;
    doc["sensor_type"] = sensorType;
    
    if (message != nullptr) {
        doc["message"] = message;
    }
    
    String payload;
    serializeJson(doc, payload);
    
    // Publish to status topic
    char statusTopic[50];
    snprintf(statusTopic, sizeof(statusTopic), MQTT_STATUS_TOPIC, sensorID.c_str());
    
    mqttClient.publish(statusTopic, payload.c_str());
}

void publishSensorIdentification() {
    if (!mqttClient.connected()) {
        return;
    }
    
    // Create JSON payload
    DynamicJsonDocument doc(256);
    doc["type"] = "sensor_identify";
    doc["sensor_id"] = sensorID;
    doc["sensor_type"] = sensorType;
    doc["paired"] = config.userPaired;
    doc["paired_user"] = config.pairedUserID;
    
    String payload;
    serializeJson(doc, payload);
    
    // Publish to status topic
    char statusTopic[50];
    snprintf(statusTopic, sizeof(statusTopic), MQTT_STATUS_TOPIC, sensorID.c_str());
    
    mqttClient.publish(statusTopic, payload.c_str());
    Serial.println("Published sensor identification via MQTT");
}

// MQTT loop function to be called in main loop
void mqttLoop() {
    static unsigned long lastReconnectAttempt = 0;
    static unsigned long lastKeepalivePing = 0;
    const unsigned long reconnectInterval = 5000; // 5 seconds between reconnection attempts
    const unsigned long keepaliveInterval = 15000; // Send ping every 15 seconds to maintain connection
    
    if (!mqttClient.connected()) {
        mqttConnected = false;
        unsigned long now = millis();
        
        // Only attempt reconnection every 5 seconds to avoid flooding
        if (now - lastReconnectAttempt > reconnectInterval) {
            lastReconnectAttempt = now;
            reconnectMQTT();
        }
    } else {
        mqttClient.loop();
        
        // Send periodic keepalive ping to maintain connection
        unsigned long now = millis();
        if (now - lastKeepalivePing > keepaliveInterval) {
            lastKeepalivePing = now;
            
            // Publish empty message to keep connection alive
            char statusTopic[50];
            snprintf(statusTopic, sizeof(statusTopic), MQTT_STATUS_TOPIC, sensorID.c_str());
            mqttClient.publish(statusTopic, ""); // Empty payload ping
        }
    }
}