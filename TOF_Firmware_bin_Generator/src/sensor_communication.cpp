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

// Read TOF distance (raw) - Optimized for 200cm range - returns raw millimeters
uint16_t readTOFDistanceRaw() {
    const int MAX_RETRIES = 2;  // Minimal retries for maximum speed
    const uint8_t SLAVE_ADDR = 0x01;
    
    for (int retry = 0; retry < MAX_RETRIES; retry++) {
        diagnostics.totalReadings++;
        
        uint8_t cmd[8] = {SLAVE_ADDR, 0x03, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00};
        uint16_t crc = modbusCRC(cmd, 6);
        cmd[6] = crc & 0xFF;
        cmd[7] = (crc >> 8) & 0xFF;

        // Clear serial buffer before sending command
        while (TOFSerial.available()) TOFSerial.read();
        
        // Send command with minimal timing
        TOFSerial.write(cmd, 8);
        TOFSerial.flush();

        // Minimal delay to allow sensor to process
        delay(1);

        uint8_t response[7];
        int bytesRead = 0;
        unsigned long startTime = millis();
        
        // Wait for complete response with minimal timeout for real-time performance
        while (bytesRead < 7 && millis() - startTime < 30) {  // Reduced timeout to 30ms
            if (TOFSerial.available()) {
                response[bytesRead++] = TOFSerial.read();
                startTime = millis(); // Reset timeout on each byte received
            }
            yield();
        }

        // Check if we got complete response
        if (bytesRead != 7) {
            diagnostics.timeouts++;
            delay(2);  // Minimal delay for recovery
            continue;
        }
        
        // Validate response header
        if (response[0] != SLAVE_ADDR || response[1] != 0x03 || response[2] != 0x02) {
            delay(2);
            continue;
        }
        
        // Validate CRC
        uint16_t receivedCRC = response[5] | (response[6] << 8);
        uint16_t calculatedCRC = modbusCRC(response, 5);
        
        if (receivedCRC != calculatedCRC) {
            diagnostics.crcErrors++;
            delay(2);
            continue;
        }
        
        // Extract distance in millimeters (raw sensor output)
        uint16_t dist_mm = (response[3] << 8) | response[4];
        
        // Validate distance range for 2000mm (2m) max requirement
        // Allow wider range for physics experiments (10mm to 2000mm)
        if (dist_mm < 10 || dist_mm > 2000) {  // 10mm to 2000mm (1cm to 200cm)
            diagnostics.outOfRange++;
            delay(2);
            continue;
        }
        
        diagnostics.successfulReadings++;
        return dist_mm;  // Return raw millimeter value
    }
    
    return 65535;  // Error value
}

// Read TOF distance with optimized filtering for 200cm range
float readTOFDistance() {
    const int NUM_SAMPLES = min(config.averagingSamples, 5);  // Max 5 samples for responsiveness
    const int MAX_INVALID = 1;  // Only allow 1 invalid reading
    
    uint16_t samples[NUM_SAMPLES];
    int validSamples = 0;
    
    // Collect samples quickly with minimal delays
    for (int i = 0; i < NUM_SAMPLES; i++) {
        uint16_t reading = readTOFDistanceRaw();
        
        // Skip invalid readings (65535 indicates error)
        if (reading != 65535) {
            samples[validSamples++] = reading;
        }
        
        // Minimal delay between samples for real-time performance
        if (i < NUM_SAMPLES - 1) delay(2);
    }
    
    // If insufficient valid samples, return error value
    static float lastValidReading = 0.0f;
    if (validSamples == 0) {
        return lastValidReading;  // Return last valid reading
    }
    
    // Simple median calculation (no full sort needed for small sample size)
    uint16_t median = samples[validSamples / 2];
    
    // Convert raw mm to cm (sensor outputs mm, but we want cm for consistency)
    float currentReadingCm = median / 10.0f;
    
    // Apply calibration with proper unit handling
    // calibration.offsetMM is in mm, so convert to cm for consistency
    float calibratedReading = (currentReadingCm * calibration.scaleFactor) + (calibration.offsetMM / 10.0f);
    
    // Light smoothing for stability without sacrificing responsiveness
    static float smoothedReading = 0.0f;
    const float SMOOTHING_FACTOR = 0.3f;
    
    if (smoothedReading == 0.0f) {
        smoothedReading = calibratedReading;
    } else {
        // Apply exponential smoothing with reasonable change limits
        float newSmoothed = SMOOTHING_FACTOR * calibratedReading + (1 - SMOOTHING_FACTOR) * smoothedReading;
        
        // Limit maximum change to prevent unrealistic jumps (1.5cm per reading)
        float maxChange = 1.5f;
        if (abs(newSmoothed - smoothedReading) > maxChange) {
            if (newSmoothed > smoothedReading) {
                smoothedReading += maxChange;
            } else {
                smoothedReading -= maxChange;
            }
        } else {
            smoothedReading = newSmoothed;
        }
    }
    
    // Store last valid reading
    lastValidReading = smoothedReading;
    
    return smoothedReading;
}

// Read TOF distance in millimeters - raw data without any filtering or smoothing
// For physics lab displacement analysis with millimeter precision
uint16_t readTOFDistanceMM() {
    // Get single raw reading in millimeters
    uint16_t raw_distance_mm = readTOFDistanceRaw();
    
    // If reading is valid, apply basic calibration (offset only, no scaling)
    if (raw_distance_mm != 65535) {
        // Apply offset calibration (in millimeters)
        int32_t calibrated_distance = (int32_t)raw_distance_mm + (int32_t)calibration.offsetMM;
        
        // Ensure the calibrated distance is within valid range
        if (calibrated_distance < 10) calibrated_distance = 10;
        if (calibrated_distance > 2000) calibrated_distance = 2000;
        
        return (uint16_t)calibrated_distance;
    }
    
    // Return error value if reading failed
    return 65535;
}

// Set ranging mode (true = long range 800cm, false = short range 200cm)
bool setRangingMode(bool longRange) {
    uint8_t command[13];
    
    // Prepare command: 01 10 00 01 00 02 04 00 01 00 01 XX XX
    // 01: device address
    // 10: function code (write multiple registers)
    // 00 01: starting address (0x0001)
    // 00 02: number of registers (2)
    // 04: byte count (4)
    // 00 01: register 1 value (0x0001 = long range)
    // 00 01: register 2 value (0x0001 = long range)
    
    command[0] = 0x01;  // Device address
    command[1] = 0x10;  // Function code
    command[2] = 0x00;  // Starting address high
    command[3] = 0x01;  // Starting address low
    command[4] = 0x00;  // Number of registers high
    command[5] = 0x02;  // Number of registers low
    command[6] = 0x04;  // Byte count
    
    if (longRange) {
        command[7] = 0x00;  // Register 1 high
        command[8] = 0x01;  // Register 1 low (long range = 800cm)
        command[9] = 0x00;  // Register 2 high
        command[10] = 0x01; // Register 2 low (long range = 800cm)
        Serial.printf("Setting TOF400F to LONG range mode (800cm max)\n");
    } else {
        command[7] = 0x00;  // Register 1 high
        command[8] = 0x00;  // Register 1 low (short range = 200cm)
        command[9] = 0x00;  // Register 2 high
        command[10] = 0x00; // Register 2 low (short range = 200cm)
        Serial.printf("Setting TOF400F to SHORT range mode (200cm max)\n");
    }
    
    // Calculate CRC
    uint16_t crc = modbusCRC(command, 11);
    command[11] = crc & 0xFF;
    command[12] = (crc >> 8) & 0xFF;
    
    // Clear any leftover data in buffer
    while (TOFSerial.available()) {
        TOFSerial.read();
    }
    
    // Send command
    TOFSerial.write(command, 13);
    TOFSerial.flush();
    
    // Wait for response with shorter delay for 200cm optimization
    delay(50);
    
    // Read response (should be 8 bytes)
    uint8_t response[8];
    int bytesRead = TOFSerial.readBytes(response, 8);
    
    if (bytesRead == 8) {
        // Check if response is valid
        if (response[0] == 0x01 && response[1] == 0x10) {
            Serial.printf("Ranging mode set to %s successfully\n", longRange ? "LONG (800cm)" : "SHORT (200cm)");
            
            // Additional delay for mode switching stabilization
            delay(100);
            return true;
        }
    }
    
    Serial.printf("Failed to set ranging mode to %s - check sensor connection\n", 
                 longRange ? "LONG" : "SHORT");
    
    // Try to read current mode as fallback
    uint16_t testReading = readTOFDistanceRaw();
    if (testReading != 65535) {
        Serial.printf("Sensor is responsive at %dmm, continuing with current mode\n", testReading);
        return true;
    }
    
    return false;
}

// Configure sensor for optimal 200cm range performance
bool configureSensorForMaxRange(uint16_t maxRange) {
    Serial.printf("Configuring TOF400F sensor for %dcm optimal range...\n", maxRange / 10);
    
    // For 200cm range, use SHORT range mode (better accuracy for close distances)
    // TOF400F: SHORT mode = 2000mm (200cm), LONG mode = 8000mm (800cm)
    bool useLongRange = (maxRange > 2000);  // Only use long range if >200cm required
    
    // Try multiple times with different approaches
    for (int attempt = 1; attempt <= 3; attempt++) {
        Serial.printf("Attempt %d/3 to configure sensor for %s range...\n", 
                     attempt, useLongRange ? "LONG" : "SHORT");
        
        if (setRangingMode(useLongRange)) {
            Serial.printf("Sensor configured successfully for %s range (%dcm)\n", 
                         useLongRange ? "LONG" : "SHORT", useLongRange ? 800 : 200);
            
            // Additional optimization: set default calibration for better accuracy
            calibration.offsetMM = 0.0f;    // No offset by default
            calibration.scaleFactor = 1.0f; // No scaling by default
            calibration.minValidReading = 20;   // 2cm minimum
            calibration.maxValidReading = 2000; // 200cm maximum
            
            Serial.println("Default calibration set for 20-2000mm range (2-200cm)");
            return true;
        }
        
        // Wait before retrying with increasing delays
        delay(100 * attempt);
    }
    
    // If all attempts failed, try fallback configuration
    Serial.println("Range configuration failed, trying fallback initialization...");
    
    // Send test commands to check sensor responsiveness
    uint16_t testDistance = readTOFDistanceRaw();
    if (testDistance != 65535) {
        Serial.printf("Sensor is responsive at %dmm. Using default SHORT range mode.\n", testDistance);
        
        // Set reasonable defaults for 200cm operation
        calibration.offsetMM = 0.0f;
        calibration.scaleFactor = 1.0f;
        calibration.minValidReading = 20;
        calibration.maxValidReading = 2000;
        
        return true;
    }
    
    Serial.println("ERROR: Sensor initialization failed - check wiring and power");
    return false;
}