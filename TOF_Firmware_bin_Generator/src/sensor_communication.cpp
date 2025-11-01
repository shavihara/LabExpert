#include "sensor_communication.h"
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include "config_handler.h"

// External declaration for TOF serial (defined in main_sensor.cpp)
extern HardwareSerial TOFSerial;
extern ExperimentConfig config;

// Global variables
SensorCalibration calibration;
DiagnosticStats diagnostics;
String sensorType = "UNKNOWN";
String sensorID = "UNKNOWN";

// Detect sensor from EEPROM
bool detectSensorFromEEPROM() {
    for (int retry = 0; retry < EEPROM_RETRY_COUNT; retry++) {
        Wire.beginTransmission(EEPROM_SENSOR_ADDR);
        int error = Wire.endTransmission();
        if (error == 0) {
            Wire.beginTransmission(EEPROM_SENSOR_ADDR);
            Wire.write(0x00);
            if (Wire.endTransmission(false) == 0) {
                Wire.requestFrom(EEPROM_SENSOR_ADDR, EEPROM_SIZE);
                if (Wire.available() >= EEPROM_SIZE) {
                    char buffer[EEPROM_SIZE + 1];
                    for (int i = 0; i < EEPROM_SIZE; i++) {
                        buffer[i] = Wire.read();
                    }
                    buffer[EEPROM_SIZE] = '\0';
                    String eepromData = String(buffer);
                    Serial.printf("EEPROM data: %s\n", eepromData.c_str());

                    if (eepromData == "OSI") {
                        sensorType = "OSI";
                    } else if (eepromData == "TOF") {
                        sensorType = "TOF";
                    } else {
                        sensorType = "UNKNOWN";
                    }
                    Serial.printf("Sensor Type: %s, ID: %s\n", sensorType.c_str(), sensorID.c_str());
                    return (sensorType != "UNKNOWN");
                } else {
                    Serial.println("✘ Not enough data from EEPROM");
                }
            } else {
                Serial.println("✘ Failed to set EEPROM address");
            }
        } else {
            Serial.printf("✘ EEPROM sensor not found, I2C error: %d\n", error);
        }
        if (retry < EEPROM_RETRY_COUNT - 1) {
            Serial.printf("Retrying EEPROM detection (%d/%d)...\n", retry + 1, EEPROM_RETRY_COUNT);
            delay(EEPROM_RETRY_DELAY);
        }
    }
    return false;
}

// Get device ID from MAC address
String getDeviceIDFromMAC() {
    String mac = WiFi.macAddress(); // "AA:BB:CC:DD:EE:FF"
    mac.replace(":", "");
    if (mac.length() >= 5) return mac.substring(mac.length()-5);
    return mac;
}

// Modbus CRC calculation
uint16_t modbusCRC(uint8_t *buf, int len) {
    uint16_t crc = 0xFFFF;
    for (int pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buf[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

// Read TOF distance (raw)
uint16_t readTOFDistanceRaw() {
    const int MAX_RETRIES = 3;  // Increased from 1 to 3 retries
    const uint8_t SLAVE_ADDR = 0x01;
    
    for (int retry = 0; retry < MAX_RETRIES; retry++) {
        diagnostics.totalReadings++;
        
        uint8_t cmd[8] = {SLAVE_ADDR, 0x03, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00};
        uint16_t crc = modbusCRC(cmd, 6);
        cmd[6] = crc & 0xFF;
        cmd[7] = (crc >> 8) & 0xFF;

        while (TOFSerial.available()) TOFSerial.read();
        
        TOFSerial.write(cmd, 8);
        TOFSerial.flush();

        uint8_t response[7];
        int bytesRead = 0;
        unsigned long startTime = millis();
        
        while (bytesRead < 7 && millis() - startTime < 50) {  // Increased timeout from 20ms to 50ms
            if (TOFSerial.available()) {
                response[bytesRead++] = TOFSerial.read();
            }
            yield();
        }

        if (bytesRead != 7) {
            diagnostics.timeouts++;
            delay(10);  // Increased delay for better recovery
            continue;
        }
        
        if (response[0] != SLAVE_ADDR || response[1] != 0x03 || response[2] != 0x02) {
            delay(10);  // Increased delay
            continue;
        }
        
        uint16_t receivedCRC = response[5] | (response[6] << 8);
        uint16_t calculatedCRC = modbusCRC(response, 5);
        
        if (receivedCRC != calculatedCRC) {
            diagnostics.crcErrors++;
            delay(10);  // Increased delay
            continue;
        }
        
        uint16_t dist = (response[3] << 8) | response[4];
        
        if (dist < calibration.minValidReading || dist > calibration.maxValidReading) {
            diagnostics.outOfRange++;
            return 65535;
        }
        
        diagnostics.successfulReadings++;
        return dist;
    }
    
    return 65535;
}

// Read TOF distance (processed)
float readTOFDistance() {
    if (config.averagingSamples <= 1) {
        uint16_t raw = readTOFDistanceRaw();
        if (raw == 65535) return 65535.0;
        return (raw * calibration.scaleFactor) + calibration.offsetMM;
    }
    
    const int maxSamples = min(config.averagingSamples, 10);
    uint16_t samples[10];
    int validCount = 0;
    
    for (int i = 0; i < maxSamples; i++) {
        uint16_t raw = readTOFDistanceRaw();
        if (raw != 65535) {
            samples[validCount++] = raw;
        }
        if (i < maxSamples - 1) delay(10);
    }
    
    if (validCount == 0) return 65535.0;
    
    for (int i = 0; i < validCount - 1; i++) {
        for (int j = 0; j < validCount - i - 1; j++) {
            if (samples[j] > samples[j + 1]) {
                uint16_t temp = samples[j];
                samples[j] = samples[j + 1];
                samples[j + 1] = temp;
            }
        }
    }
    
    float result;
    if (validCount >= 3) {
        result = (validCount % 2 == 0) ? (samples[validCount/2 - 1] + samples[validCount/2]) / 2.0 : samples[validCount/2];
    } else {
        float sum = 0;
        for (int i = 0; i < validCount; i++) sum += samples[i];
        result = sum / validCount;
    }
    
    return (result * calibration.scaleFactor) + calibration.offsetMM;
}

// Set ranging mode
bool setRangingMode(bool longDistance) {
    const uint8_t SLAVE_ADDR = 0x01;
    uint16_t value = longDistance ? 0x0001 : 0x0000;
    uint8_t cmd[8] = {SLAVE_ADDR, 0x06, 0x00, 0x04, (uint8_t)(value >> 8), (uint8_t)(value & 0xFF), 0x00, 0x00};
    uint16_t crc = modbusCRC(cmd, 6);
    cmd[6] = crc & 0xFF;
    cmd[7] = (crc >> 8) & 0xFF;
    
    while (TOFSerial.available()) TOFSerial.read();
    
    TOFSerial.write(cmd, 8);
    TOFSerial.flush();
    
    uint8_t response[8];
    int bytesRead = 0;
    unsigned long startTime = millis();
    while (bytesRead < 8 && millis() - startTime < 300) {
        if (TOFSerial.available()) response[bytesRead++] = TOFSerial.read();
    }
    
    if (bytesRead == 8 && response[0] == SLAVE_ADDR && response[1] == 0x06) {
        uint16_t receivedCRC = response[6] | (response[7] << 8);
        uint16_t calculatedCRC = modbusCRC(response, 6);
        if (receivedCRC == calculatedCRC) {
            delay(150);
            Serial.printf("Range mode set to %s successfully\n", longDistance ? "LONG (8000mm)" : "SHORT (2000mm)");
            return true;
        }
    }
    
    Serial.println("ERROR: Range mode setting failed");
    return false;
}

// Configure sensor for maximum range
bool configureSensorForMaxRange(uint16_t maxRange) {
    Serial.printf("Configuring sensor for maximum range (%dmm)...\n", maxRange);
    
    // Try multiple times with different approaches
    for (int attempt = 1; attempt <= 3; attempt++) {
        Serial.printf("Attempt %d/3 to configure sensor...\n", attempt);
        
        if (setRangingMode(true)) {
            Serial.println("Sensor configured successfully");
            return true;
        }
        
        // Wait before retrying
        delay(200 * attempt);
    }
    
    // If all attempts failed, try a different approach
    Serial.println("Standard configuration failed, trying alternative initialization...");
    
    // Send a simple read command to check if sensor is responsive
    uint16_t testDistance = readTOFDistanceRaw();
    if (testDistance != 65535) {
        Serial.printf("Sensor is responsive but range configuration failed. Continuing with default settings.\n");
        // Sensor is working but range configuration failed - we can still proceed
        return true;
    }
    
    Serial.println("ERROR: Sensor initialization failed completely");
    return false;
}