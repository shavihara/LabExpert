#include "experiment_manager.h"
#include "sensor_communication.h"
#include "mqtt_handler.h"
#include "config_handler.h"
#include <esp_partition.h>
#include <esp_ota_ops.h>
#include <driver/timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

#define STATUS_LED 2

// Experiment data arrays
float distances[MAX_SAMPLES];
unsigned long timestamps[MAX_SAMPLES];
int sampleCount = 0;

// Experiment state variables
bool experimentRunning = false;
bool dataReady = false;
unsigned long experimentStartTime = 0;
unsigned long lastSampleTime = 0;
int sampleInterval = 1000 / 50;

// Sensor detection variables
unsigned long lastSensorCheck = 0;
const unsigned long SENSOR_CHECK_INTERVAL = 5000;
bool sensorWasPresent = false;
unsigned long lastExperimentEnd = 0;
bool backendCleanupRequested = false;

// Hardware timer and queue
QueueHandle_t sensorDataQueue = NULL;
volatile bool timerInitialized = false;
volatile bool sampleRequested = false;

// Binary data batching
BinarySample sampleBuffer[BINARY_MAX_SAMPLES_PER_PACKET];
uint16_t bufferedSampleCount = 0;

// CRITICAL FIX: Pre-captured timestamps
volatile unsigned long preCapturedTimestamp = 0;
TaskHandle_t sensorTaskHandle = NULL;

// Forward declarations
void flushSampleBuffer();
void sensorReadingTask(void* parameter);

// Timer ISR - captures timestamp FIRST
void IRAM_ATTR timerISR(void* arg) {
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    
    if (experimentRunning) {
        // CRITICAL: Capture timestamp IMMEDIATELY
        preCapturedTimestamp = millis();
        sampleRequested = true;
        
        // Wake sensor task
        if (sensorTaskHandle != NULL) {
            vTaskNotifyGiveFromISR(sensorTaskHandle, &xHigherPriorityTaskWoken);
        }
    }
    
    timer_group_clr_intr_status_in_isr(TIMER_GROUP_0, TIMER_0);
    timer_group_enable_alarm_in_isr(TIMER_GROUP_0, TIMER_0);
    
    if (xHigherPriorityTaskWoken) {
        portYIELD_FROM_ISR();
    }
}

// Dedicated sensor task on Core 0
void sensorReadingTask(void* parameter) {
    Serial.println("Sensor task started on Core 0");
    
    while (true) {
        // Wait for timer trigger
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(10));
        
        if (sampleRequested && experimentRunning) {
            // Use pre-captured timestamp
            unsigned long timestamp = preCapturedTimestamp;
            sampleRequested = false;
            
            // Read sensor (safe now, timestamp already captured)
            uint16_t distance_mm = readTOFDistanceMM();
            
            if (distance_mm != 65535 && sampleCount < MAX_SAMPLES) {
                // Store directly (avoid queue overhead for simplicity)
                timestamps[sampleCount] = timestamp - experimentStartTime;
                distances[sampleCount] = distance_mm;
                
                // Add to buffer for MQTT
                if (bufferedSampleCount < BINARY_MAX_SAMPLES_PER_PACKET) {
                    sampleBuffer[bufferedSampleCount].timestamp = timestamps[sampleCount];
                    sampleBuffer[bufferedSampleCount].distance = distance_mm;
                    sampleBuffer[bufferedSampleCount].sample_number = sampleCount;
                    bufferedSampleCount++;
                }
                
                sampleCount++;
                digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
                
                // Debug first few samples
                if (sampleCount <= 5) {
                    Serial.printf("Sample %d: %umm @ %ums\n", 
                                 sampleCount, distance_mm, timestamps[sampleCount-1]);
                }
            }
        }
        
        vTaskDelay(1);
    }
}

// Process data in main loop
void processSensorDataQueue() {
    static unsigned long lastFlushTime = 0;
    
    // Flush buffer periodically
    if (bufferedSampleCount > 0 && (millis() - lastFlushTime > 50)) {
        flushSampleBuffer();
        lastFlushTime = millis();
    }
}

// Main experiment loop
void manageExperimentLoop() {
    processSensorDataQueue();
    
    if (experimentRunning) {
        unsigned long currentTime = millis();
        unsigned long elapsedTime = currentTime - experimentStartTime;
        
        if (config.duration > 0 && elapsedTime >= config.duration * 1000) {
            experimentRunning = false;
            dataReady = true;
            lastExperimentEnd = millis();
            
            flushSampleBuffer();
            
            Serial.printf("Experiment COMPLETED. Collected %d samples in %lu ms\n", 
                         sampleCount, elapsedTime);
            
            if (mqttConnected) {
                String msg = "Completed with " + String(sampleCount) + " samples";
                publishStatus("experiment_completed", msg.c_str());
            }
        }
    } else {
        digitalWrite(STATUS_LED, LOW);
    }
}

// Initialize hardware timer
bool initHardwareTimer() {
    if (timerInitialized) return true;
    
    // Create sensor task on Core 0
    xTaskCreatePinnedToCore(
        sensorReadingTask,
        "SensorTask",
        4096,
        NULL,
        configMAX_PRIORITIES-1,
        &sensorTaskHandle,
        0  // Core 0
    );
    
    if (sensorTaskHandle == NULL) {
        Serial.println("ERROR: Failed to create sensor task");
        return false;
    }
    
    // Configure timer
    timer_config_t timerConfig = {
        .alarm_en = TIMER_ALARM_EN,
        .counter_en = TIMER_PAUSE,
        .intr_type = TIMER_INTR_LEVEL,
        .counter_dir = TIMER_COUNT_UP,
        .auto_reload = TIMER_AUTORELOAD_EN,
        .divider = 80
    };
    
    timer_init(TIMER_GROUP_0, TIMER_0, &timerConfig);
    
    int intervalMicroseconds = 1000000 / config.frequency;
    timer_set_alarm_value(TIMER_GROUP_0, TIMER_0, intervalMicroseconds);
    timer_enable_intr(TIMER_GROUP_0, TIMER_0);
    timer_isr_register(TIMER_GROUP_0, TIMER_0, timerISR, NULL, ESP_INTR_FLAG_IRAM, NULL);
    timer_start(TIMER_GROUP_0, TIMER_0);
    
    timerInitialized = true;
    Serial.printf("Timer initialized for %dHz\n", config.frequency);
    return true;
}

// Update timer frequency
void updateTimerFrequency(int frequency) {
    if (!timerInitialized) return;
    
    timer_pause(TIMER_GROUP_0, TIMER_0);
    int intervalMicroseconds = 1000000 / frequency;
    timer_set_alarm_value(TIMER_GROUP_0, TIMER_0, intervalMicroseconds);
    sampleInterval = 1000 / frequency;
    timer_start(TIMER_GROUP_0, TIMER_0);
    
    Serial.printf("Timer frequency updated to %dHz\n", frequency);
}

// Flush sample buffer
void flushSampleBuffer() {
    if (bufferedSampleCount > 0) {
        publishBinarySensorData(sampleBuffer, bufferedSampleCount, experimentStartTime, sampleCount);
        bufferedSampleCount = 0;
    }
}

// Check sensor status
void checkSensorStatus() {
    if (millis() - lastSensorCheck > SENSOR_CHECK_INTERVAL) {
        lastSensorCheck = millis();
        bool sensorCurrentlyPresent = detectSensorFromEEPROM();
        
        if (sensorWasPresent && !sensorCurrentlyPresent) {
            Serial.println("Sensor unplugged! Rebooting...");
            if (mqttConnected) {
                publishStatus("sensor_unplugged", "Rebooting to bootloader");
            }
            delay(1000);
            ESP.restart();
        }
        
        sensorWasPresent = sensorCurrentlyPresent;
    }
}

// Handle backend cleanup
void handleBackendCleanup() {
    if (backendCleanupRequested) {
        Serial.println("Backend cleanup requested");
        backendCleanupRequested = false;
        
        if (mqttConnected) {
            publishStatus("disconnected", "Rebooting to bootloader");
        }
        delay(1000);
        ESP.restart();
    }
}