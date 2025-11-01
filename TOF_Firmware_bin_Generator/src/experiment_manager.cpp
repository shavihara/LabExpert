#include "experiment_manager.h"
#include "sensor_communication.h"
#include "mqtt_handler.h"
#include "config_handler.h"
#include <esp_partition.h>
#include <esp_ota_ops.h>
#include <driver/timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

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

// Hardware timer and queue for interrupt-driven sampling
QueueHandle_t sensorDataQueue = NULL;
volatile bool timerInitialized = false;
volatile bool sampleRequested = false;

// Binary data batching
BinarySample sampleBuffer[BINARY_MAX_SAMPLES_PER_PACKET];
uint16_t bufferedSampleCount = 0;

// Forward declarations
void processSensorDataQueue();
void flushSampleBuffer();

// Sensor data structure for queue
struct SensorData {
    uint32_t timestamp;
    uint16_t distance;
    uint16_t sampleNumber;
};

// Timer interrupt service routine (ISR)
void IRAM_ATTR timerISR(void* arg) {
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    
    if (experimentRunning) {
        // Set flag to request sample (don't read sensor in ISR)
        sampleRequested = true;
    }
    
    // Clear interrupt flag
    timer_group_clr_intr_status_in_isr(TIMER_GROUP_0, TIMER_0);
    timer_group_enable_alarm_in_isr(TIMER_GROUP_0, TIMER_0);
    
    // Yield if higher priority task woken
    if (xHigherPriorityTaskWoken) {
        portYIELD_FROM_ISR();
    }
}

// Manage experiment loop
void manageExperimentLoop() {
    // Process any sensor data from the interrupt-driven queue
    processSensorDataQueue();
    
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
    } else {
        digitalWrite(STATUS_LED, LOW);
    }
}

// Initialize hardware timer for 50Hz sampling
bool initHardwareTimer() {
    if (timerInitialized) {
        return true;
    }
    
    // Create queue for sensor data
    sensorDataQueue = xQueueCreate(100, sizeof(SensorData));
    if (sensorDataQueue == NULL) {
        Serial.println("ERROR: Failed to create sensor data queue");
        return false;
    }
    
    // Configure timer - initialize in declaration order to avoid compiler errors
    timer_config_t timerConfig;
    timerConfig.divider = 80; // 80MHz / 80 = 1MHz (1 microsecond per tick)
    timerConfig.counter_dir = TIMER_COUNT_UP;
    timerConfig.counter_en = TIMER_PAUSE;
    timerConfig.alarm_en = TIMER_ALARM_EN;
    timerConfig.intr_type = TIMER_INTR_LEVEL;
    timerConfig.auto_reload = TIMER_AUTORELOAD_EN;
    
    timer_init(TIMER_GROUP_0, TIMER_0, &timerConfig);
    
    // Set alarm value based on configured frequency
    int intervalMicroseconds = 1000000 / ::config.frequency; // Convert Hz to microseconds
    timer_set_alarm_value(TIMER_GROUP_0, TIMER_0, intervalMicroseconds);
    
    // Enable timer interrupt
    timer_enable_intr(TIMER_GROUP_0, TIMER_0);
    
    // Register ISR
    timer_isr_register(TIMER_GROUP_0, TIMER_0, timerISR, NULL, ESP_INTR_FLAG_IRAM, NULL);
    
    // Start timer
    timer_start(TIMER_GROUP_0, TIMER_0);
    
    timerInitialized = true;
    Serial.println("Hardware timer initialized for 50Hz sampling");
    return true;
}

// Flush buffered samples to MQTT
void flushSampleBuffer() {
    if (bufferedSampleCount > 0) {
        publishBinarySensorData(sampleBuffer, bufferedSampleCount, experimentStartTime, sampleCount);
        bufferedSampleCount = 0;
    }
}

// Process sensor data from queue in main loop
void processSensorDataQueue() {
    // Check if sample was requested by timer ISR
    if (sampleRequested && experimentRunning) {
        sampleRequested = false;
        
        // Read sensor data (in main loop, not ISR)
        uint16_t distance = readTOFDistance();
        uint32_t timestamp = millis();
        
        // Store data in arrays
        if (sampleCount < MAX_SAMPLES) {
            timestamps[sampleCount] = timestamp - experimentStartTime;
            distances[sampleCount] = distance;
        }
        
        // Add to binary sample buffer
        if (bufferedSampleCount < BINARY_MAX_SAMPLES_PER_PACKET) {
            sampleBuffer[bufferedSampleCount].timestamp = timestamp - experimentStartTime;
            sampleBuffer[bufferedSampleCount].distance = distance;
            sampleBuffer[bufferedSampleCount].sample_number = sampleCount;
            bufferedSampleCount++;
        }
        
        // Flush buffer if full
        if (bufferedSampleCount >= BINARY_MAX_SAMPLES_PER_PACKET) {
            flushSampleBuffer();
        }
        
        // Increment sample count
        sampleCount++;
        
        // Toggle status LED
        digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
    }
    
    // Flush any remaining samples at the end
    static unsigned long lastFlushTime = 0;
    unsigned long currentTime = millis();
    if (bufferedSampleCount > 0 && (currentTime - lastFlushTime > 100)) { // Flush every 100ms
        flushSampleBuffer();
        lastFlushTime = currentTime;
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