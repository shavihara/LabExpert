#pragma once
#include <Arduino.h>
#include "Config.h"

class LEDManager
{
public:
    void begin();
    void updateWiFi(bool isConnected);
    void updateSensor(bool sensorPresent);
    void handleBlinking();

private:
    struct LEDState
    {
        uint8_t pin;
        bool state;
        unsigned long previousMillis;
        bool blinking;
    };

    void handleLED(LEDState &led, unsigned long currentTime);

    LEDState wifiLED = {WIFI_LED, false, 0, true};
    LEDState sensorLED = {SENSOR_LED, false, 0, true};
};