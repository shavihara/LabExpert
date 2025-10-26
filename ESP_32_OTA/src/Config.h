#pragma once
#include <WiFi.h>

// Network Configuration
extern const char *SSID;
extern const char *PASSWORD;
extern IPAddress LOCAL_IP;
extern IPAddress GATEWAY;
extern IPAddress SUBNET;

// Backend Configuration
extern const char *BACKEND_HOST;
extern const uint16_t BACKEND_PORT;
extern const char *WS_ENDPOINT;

// Hardware Configuration
extern const uint8_t WIFI_LED;
extern const uint8_t SENSOR_LED;
extern const uint8_t EEPROM_SENSOR_ADDR;
extern const uint8_t EEPROM_SIZE;

// Timing Configuration
extern const unsigned long SENSOR_CHECK_INTERVAL;
extern const unsigned long LED_BLINK_INTERVAL;
extern const unsigned long WS_RECONNECT_INTERVAL;

// Retry Configuration
extern const uint8_t EEPROM_RETRY_COUNT;
extern const uint16_t EEPROM_RETRY_DELAY;

// Global state declarations
extern String deviceID;
extern String sensorType;
extern String sensorID;
extern bool backendCleanupRequested;