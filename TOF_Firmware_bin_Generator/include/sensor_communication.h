#ifndef SENSOR_COMMUNICATION_H
#define SENSOR_COMMUNICATION_H

#include <Arduino.h>
#include <Wire.h>

// EEPROM configuration
#define EEPROM_SENSOR_ADDR 0x50
#define EEPROM_SIZE 3
#define EEPROM_RETRY_COUNT 3
#define EEPROM_RETRY_DELAY 1000

// Sensor calibration structure
struct SensorCalibration {
    float offsetMM = 0.0;
    float scaleFactor = 1.0;
    uint16_t minValidReading = 10;
    uint16_t maxValidReading = 8500;
};

// Diagnostic statistics
struct DiagnosticStats {
    uint32_t totalReadings = 0;
    uint32_t successfulReadings = 0;
    uint32_t crcErrors = 0;
    uint32_t timeouts = 0;
    uint32_t outOfRange = 0;
};

// Function declarations
bool detectSensorFromEEPROM();
String getDeviceIDFromMAC();
uint16_t modbusCRC(uint8_t *buf, int len);
uint16_t readTOFDistanceRaw();
float readTOFDistance();
bool setRangingMode(bool longDistance);
bool configureSensorForMaxRange(uint16_t maxRange);

// External variables
extern SensorCalibration calibration;
extern DiagnosticStats diagnostics;
extern String sensorType;
extern String sensorID;

#endif