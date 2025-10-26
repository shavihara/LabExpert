#include "SensorManager.h"
#include "Config.h"

void SensorManager::begin() {
    Wire.begin(21, 22); // SDA, SCL
}

bool SensorManager::readEEPROM() {
    Wire.beginTransmission(EEPROM_SENSOR_ADDR);
    int error = Wire.endTransmission();
    if (error != 0) return false;
    
    Wire.beginTransmission(EEPROM_SENSOR_ADDR);
    Wire.write(0x00);
    if (Wire.endTransmission(false) != 0) return false;
    
    Wire.requestFrom(EEPROM_SENSOR_ADDR, EEPROM_SIZE);
    if (Wire.available() < EEPROM_SIZE) return false;
    
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
    
    return (sensorType != "UNKNOWN");
}

bool SensorManager::detect() {
    for (int retry = 0; retry < EEPROM_RETRY_COUNT; retry++) {
        if (readEEPROM()) {
            Serial.printf("Sensor Type: %s, ID: %s\n", sensorType.c_str(), sensorID.c_str());
            return true;
        }
        Serial.printf("✘ EEPROM read failed, retry %d/%d\n", retry + 1, EEPROM_RETRY_COUNT);
        if (retry < EEPROM_RETRY_COUNT - 1) delay(EEPROM_RETRY_DELAY);
    }
    sensorType = "UNKNOWN";
    return false;
}

String SensorManager::getType() { 
    return sensorType; 
}

String SensorManager::getID() { 
    return sensorID; 
}

bool SensorManager::shouldCheck(unsigned long currentTime) {
    return (currentTime - lastCheck >= SENSOR_CHECK_INTERVAL);
}

void SensorManager::updateCheckTime(unsigned long currentTime) {
    lastCheck = currentTime;
}