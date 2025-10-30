#include "experiment_manager.h"
#include "sensor_communication.h"
#include "mqtt_handler.h"
#include "config_handler.h"
#include <esp_partition.h>
#include <esp_ota_ops.h>

// Define STATUS_LED here since it's a macro defined in main_sensor.cpp
#define STATUS_LED 2

// Experiment data arrays
float distances[MAX_SAMPLES];
unsigned long timestamps[MAX_SAMPLES];
int sampleCount = 0;

// Experiment state variables (defined here, declared as extern in headers)
bool experimentRunning = false;
bool dataReady = false;
unsigned long experimentStartTime = 0;
unsigned long lastSampleTime = 0;
int sampleInterval = 1000 / 50; // Default 50Hz

// Sensor detection variables
unsigned long lastSensorCheck = 0;
const unsigned long SENSOR_CHECK_INTERVAL = 5000;
bool sensorWasPresent = false;
unsigned long lastExperimentEnd = 0;

// Backend cleanup flag
bool backendCleanupRequested = false;

// Manage experiment loop
void manageExperimentLoop() {
    if (experimentRunning) {
        unsigned long currentTime = millis();
        unsigned long elapsedTime = currentTime - experimentStartTime;
        
        // Check if experiment should stop
        if (config.duration > 0 && elapsedTime >= config.duration * 1000) {
            experimentRunning = false;
            dataReady = true;
            
            // Set cooldown period
            lastExperimentEnd = millis();
            
            Serial.printf("Experiment COMPLETED. Collected %d samples in %lu ms\n", sampleCount, elapsedTime);
            
            // Notify backend about experiment completion via MQTT
            if (mqttConnected) {
                String completionMsg = "Experiment completed with " + String(sampleCount) + " samples";
                publishStatus("experiment_completed", completionMsg.c_str());
            }
            
            return;
        }
        
        // Sample at configured frequency
        if (currentTime - lastSampleTime >= (1000 / config.frequency)) {
            lastSampleTime = currentTime;
            
            // Read distance from sensor
            float distance = readTOFDistance();
            
            // Store data
            if (sampleCount < MAX_SAMPLES) {
                timestamps[sampleCount] = elapsedTime;
                distances[sampleCount] = distance;
                sampleCount++;
            }
            
            // Send data to backend via MQTT for real-time processing
            publishSensorData(currentTime, distance, sampleCount);
            
            // Toggle status LED
            digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
        }
    } else {
        digitalWrite(STATUS_LED, LOW);
    }
}

// Check sensor status periodically
void checkSensorStatus() {
    if (millis() - lastSensorCheck > SENSOR_CHECK_INTERVAL) {
        lastSensorCheck = millis();
        
        bool sensorCurrentlyPresent = detectSensorFromEEPROM();
        
        // If sensor was previously present but is now missing
        if (sensorWasPresent && !sensorCurrentlyPresent) {
            Serial.println("⚠️  Sensor unplugged detected! Returning to bootloader mode...");
            
            // Send notification to backend via MQTT
            if (mqttConnected) {
                publishStatus("sensor_unplugged", "Rebooting to bootloader mode");
            }
            
            // Wait a moment for messages to be sent
            delay(1000);
            
            // Reboot into bootloader mode
            Serial.println("🔄 Rebooting into bootloader mode...");
            
            // For ESP32 with OTA partitions, set the boot partition to ota_0 (bootloader)
            const esp_partition_t* boot_partition = esp_partition_find_first(
                ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
            
            if (boot_partition != NULL) {
                esp_ota_set_boot_partition(boot_partition);
                Serial.println("✓ Boot partition set to ota_0 (bootloader)");
            }
            
            // Perform a clean reboot
            ESP.restart();
        }
        
        // Update sensor presence state
        sensorWasPresent = sensorCurrentlyPresent;
    }
}

// Handle backend-initiated cleanup
void handleBackendCleanup() {
    if (backendCleanupRequested) {
        Serial.println("Executing backend-initiated cleanup: rebooting to bootloader mode");
        backendCleanupRequested = false; // Reset flag
        
        // Send notification to backend via MQTT
        if (mqttConnected) {
            publishStatus("disconnected", "Rebooting to bootloader mode");
        }
        
        // Wait a moment for messages to be sent
        delay(1000);
        
        // Reboot into bootloader mode
        Serial.println("🔄 Rebooting into bootloader mode...");
        
        // For ESP32 with OTA partitions, set the boot partition to ota_0 (bootloader)
        const esp_partition_t* boot_partition = esp_partition_find_first(
            ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
        
        if (boot_partition != NULL) {
            esp_ota_set_boot_partition(boot_partition);
            Serial.println("✓ Boot partition set to ota_0 (bootloader)");
        }
        
        // Perform a clean reboot
        ESP.restart();
    }
}