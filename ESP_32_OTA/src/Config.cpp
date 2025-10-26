#include "Config.h"

// Network Configuration
const char *SSID = "LabExpert_1.0";
const char *PASSWORD = "11111111";
IPAddress LOCAL_IP(192, 168, 137, 16);
IPAddress GATEWAY(192, 168, 137, 1);
IPAddress SUBNET(255, 255, 255, 0);

// Backend Configuration
const char* BACKEND_HOST = "192.168.137.1";
const uint16_t BACKEND_PORT = 5000;
const char* WS_ENDPOINT = "/ws/device";

// Hardware Configuration
const uint8_t WIFI_LED = 2;
const uint8_t SENSOR_LED = 15;
const uint8_t EEPROM_SENSOR_ADDR = 0x50;
const uint8_t EEPROM_SIZE = 3;

// Timing Configuration
const unsigned long SENSOR_CHECK_INTERVAL = 2000;
const unsigned long LED_BLINK_INTERVAL = 3000;
const unsigned long WS_RECONNECT_INTERVAL = 5000;

// Retry Configuration
const uint8_t EEPROM_RETRY_COUNT = 3;
const uint16_t EEPROM_RETRY_DELAY = 1000;

// Global state definitions
String deviceID;
String sensorType = "UNKNOWN";
String sensorID = "N/A";
bool backendCleanupRequested = false;