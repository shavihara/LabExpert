#include "LEDManager.h"
#include "Config.h"

void LEDManager::begin() {
    pinMode(wifiLED.pin, OUTPUT);
    pinMode(sensorLED.pin, OUTPUT);
    digitalWrite(wifiLED.pin, HIGH);
    digitalWrite(sensorLED.pin, HIGH);
}

void LEDManager::updateWiFi(bool isConnected) {
    wifiLED.blinking = isConnected;
    if (!isConnected) {
        digitalWrite(wifiLED.pin, LOW);
    }
}

void LEDManager::updateSensor(bool sensorPresent) {
    sensorLED.blinking = sensorPresent;
    if (!sensorPresent) {
        digitalWrite(sensorLED.pin, LOW);
    }
}

void LEDManager::handleBlinking() {
    unsigned long now = millis();
    handleLED(wifiLED, now);
    handleLED(sensorLED, now);
}

void LEDManager::handleLED(LEDState &led, unsigned long currentTime) {
    if (!led.blinking) return;
    
    if (currentTime - led.previousMillis >= LED_BLINK_INTERVAL) {
        led.previousMillis = currentTime;
        led.state = !led.state;
        digitalWrite(led.pin, led.state ? LOW : HIGH);
    }
}