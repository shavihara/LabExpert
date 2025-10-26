#pragma once
#include <Wire.h>
#include <Arduino.h>

class SensorManager {
public:
    void begin();
    bool detect();
    String getType();
    String getID();
    bool shouldCheck(unsigned long currentTime);
    void updateCheckTime(unsigned long currentTime);

private:
    bool readEEPROM();
    String sensorType = "UNKNOWN";
    String sensorID = "N/A";
    unsigned long lastCheck = 0;
};