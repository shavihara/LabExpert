#include <Wire.h>
#include <EEPROM.h>
#include <WiFi.h>
#include <PubSubClient.h>

// LED pin setup
#define SENSOR_LED 15

// EEPROM config
#define EEPROM_SENSOR_ADDR 0x50
#define EEPROM_SIZE 3

// Pin definitions
#define SENSOR_PIN 21
#define EEPROM_SDA 18
#define EEPROM_SCL 19

// WiFi and MQTT configuration
const char *ssid = "LabExpert_1.0.1";      // Replace with your PC AP SSID
const char *password = "11111111";         // Replace with your PC AP password
const char *mqtt_server = "192.168.137.1"; // Replace with your PC's IP address
const int mqtt_port = 1883;                // Default MQTT port

// MQTT Topics
const char *topic_sensor_state = "sensor/state";
const char *topic_sensor_type = "sensor/type";
const char *topic_sensor_eeprom = "sensor/eeprom";
const char *topic_sensor_status = "sensor/status";
const char *topic_commands = "sensor/commands"; // For receiving commands

// Global variables
unsigned long lastEepromCheck = 0;
unsigned long lastSensorChange = 0;
unsigned long lastBlinkTime = 0;
unsigned long lastMqttReconnect = 0;
unsigned long lastStatusPublish = 0;
int lastSensorState = -1;
int lastPublishedState = -1;
bool eepromConnected = false;
bool blinkState = false;
String sensorType = "UNK";
String lastPublishedType = "";

// WiFi and MQTT clients
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Function declarations
String readEEPROMData();
void checkSensorState();
void handleEEPROMCheck();
void handleLEDBlink();
void setupWiFi();
void setupMQTT();
void reconnectMQTT();
void mqttCallback(char *topic, byte *payload, unsigned int length);
void publishSensorState(int state);
void publishSensorType(String type);
void publishSystemStatus();

void setup()
{
    Serial.begin(115200);

    // Initialize pins
    pinMode(SENSOR_LED, OUTPUT);
    pinMode(SENSOR_PIN, INPUT);

    // Initialize I2C for EEPROM with custom pins
    Wire.begin(EEPROM_SDA, EEPROM_SCL);
    Serial.println("I2C initialized with SDA=" + String(EEPROM_SDA) + ", SCL=" + String(EEPROM_SCL));

    // Initial sensor state
    lastSensorState = digitalRead(SENSOR_PIN);
    lastSensorChange = millis();
    lastPublishedState = lastSensorState;

    // Setup WiFi and MQTT
    setupWiFi();
    setupMQTT();

    Serial.println("System started - EEPROM Reader with MQTT Mode");

    // Publish initial status
    publishSystemStatus();
}

void setupWiFi()
{
    Serial.println();
    Serial.print("Connecting to ");
    Serial.println(ssid);

    WiFi.begin(ssid, password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20)
    {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("");
        Serial.println("WiFi connected");
        Serial.println("IP address: ");
        Serial.println(WiFi.localIP());
    }
    else
    {
        Serial.println("");
        Serial.println("WiFi connection failed");
    }
}

void setupMQTT()
{
    mqttClient.setServer(mqtt_server, mqtt_port);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(512); // Increase buffer if needed
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
    Serial.print("Message arrived [");
    Serial.print(topic);
    Serial.print("]: ");

    String message;
    for (unsigned int i = 0; i < length; i++)
    {
        message += (char)payload[i];
    }
    Serial.println(message);

    // Handle incoming commands
    if (String(topic) == topic_commands)
    {
        if (message == "read_eeprom")
        {
            Serial.println("Command: Force EEPROM read");
            handleEEPROMCheck();
        }
        else if (message == "read_sensor")
        {
            Serial.println("Command: Read sensor state");
            checkSensorState();
            publishSensorState(lastSensorState);
        }
        else if (message == "status")
        {
            Serial.println("Command: Get status");
            publishSystemStatus();
        }
    }
}

void reconnectMQTT()
{
    // Loop until we're reconnected
    while (!mqttClient.connected())
    {
        Serial.print("Attempting MQTT connection...");

        // Attempt to connect
        String clientId = "ESP32-SensorClient-";
        clientId += String(random(0xffff), HEX);

        if (mqttClient.connect(clientId.c_str()))
        {
            Serial.println("connected");

            // Subscribe to command topic
            mqttClient.subscribe(topic_commands);
            Serial.println("Subscribed to: " + String(topic_commands));

            // Publish connection status
            publishSystemStatus();
        }
        else
        {
            Serial.print("failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(" try again in 5 seconds");
            delay(5000);
        }
    }
}

String readEEPROMData()
{
    String data = "";
    Wire.beginTransmission(EEPROM_SENSOR_ADDR);
    Wire.write(0);
    if (Wire.endTransmission() == 0)
    {
        Wire.requestFrom(EEPROM_SENSOR_ADDR, EEPROM_SIZE);
        for (int i = 0; i < EEPROM_SIZE && Wire.available(); i++)
        {
            char c = Wire.read();
            if (c >= 32 && c <= 126)
            {
                data += c;
            }
            else
            {
                data += "?";
            }
        }
        eepromConnected = true;
        Serial.println("EEPROM Read Successful: " + data);

        // Publish EEPROM data via MQTT
        mqttClient.publish(topic_sensor_eeprom, data.c_str());
    }
    else
    {
        eepromConnected = false;
        data = "EEPROM_NOT_FOUND";
        Serial.println("EEPROM Communication Failed");

        // Publish error via MQTT
        mqttClient.publish(topic_sensor_eeprom, "EEPROM_NOT_FOUND");
    }
    return data;
}

void checkSensorState()
{
    int currentState = digitalRead(SENSOR_PIN);

    if (currentState != lastSensorState)
    {
        lastSensorState = currentState;
        lastSensorChange = millis();
        String stateStr = currentState ? "HIGH" : "LOW";
        Serial.println("Sensor state changed to: " + stateStr);

        // Control LED based on sensor state - turn on when LOW
        if (currentState == HIGH)
        {
            digitalWrite(SENSOR_LED, HIGH);
        }
        else
        {
            digitalWrite(SENSOR_LED, LOW);
        }

        // Publish state change via MQTT
        publishSensorState(currentState);
    }
}

void handleEEPROMCheck()
{
    if (millis() - lastEepromCheck >= 5000)
    {
        String eepromData = readEEPROMData();

        if (eepromData != "EEPROM_NOT_FOUND" && eepromData.length() == 3)
        {
            sensorType = eepromData;
            Serial.println("EEPROM Sensor Type: " + sensorType);

            // Publish sensor type via MQTT if it changed
            if (sensorType != lastPublishedType)
            {
                publishSensorType(sensorType);
                lastPublishedType = sensorType;
            }

            // Blink SENSOR_LED for 1 second to indicate successful read
            digitalWrite(SENSOR_LED, HIGH);
            lastBlinkTime = millis();
            blinkState = true;
        }
        else
        {
            sensorType = "UNK";
            Serial.println("EEPROM Error or Invalid Data: " + eepromData);

            // Publish unknown type
            publishSensorType("UNK");
        }

        lastEepromCheck = millis();
    }
}

void handleLEDBlink()
{
    if (blinkState && (millis() - lastBlinkTime >= 1000))
    {
        digitalWrite(SENSOR_LED, LOW);
        blinkState = false;
    }
}

void publishSensorState(int state)
{
    String stateStr = state ? "HIGH" : "LOW";
    if (mqttClient.publish(topic_sensor_state, stateStr.c_str()))
    {
        Serial.println("Published sensor state: " + stateStr);
        lastPublishedState = state;
    }
    else
    {
        Serial.println("Failed to publish sensor state");
    }
}

void publishSensorType(String type)
{
    if (mqttClient.publish(topic_sensor_type, type.c_str()))
    {
        Serial.println("Published sensor type: " + type);
    }
    else
    {
        Serial.println("Failed to publish sensor type");
    }
}

void publishSystemStatus()
{
    String status = "Connected: " + String(WiFi.localIP().toString()) +
                    ", Sensor: " + String(lastSensorState ? "HIGH" : "LOW") +
                    ", Type: " + sensorType +
                    ", RSSI: " + String(WiFi.RSSI()) + "dBm";

    if (mqttClient.publish(topic_sensor_status, status.c_str()))
    {
        Serial.println("Published system status");
    }
    else
    {
        Serial.println("Failed to publish system status");
    }
}

void loop()
{
    // Maintain MQTT connection
    if (!mqttClient.connected())
    {
        if (millis() - lastMqttReconnect > 5000)
        {
            reconnectMQTT();
            lastMqttReconnect = millis();
        }
    }
    else
    {
        mqttClient.loop();
    }

    // Check sensor state continuously
    checkSensorState();

    // Check if sensor pin has been stable for more than 5 seconds
    if (millis() - lastSensorChange > 5000)
    {
        // Only check EEPROM when sensor is stable
        handleEEPROMCheck();
    }

    // Handle LED blinking
    handleLEDBlink();

    // Publish status every 30 seconds
    if (millis() - lastStatusPublish > 30000)
    {
        publishSystemStatus();
        lastStatusPublish = millis();
    }

    // Small delay to prevent overwhelming the processor(if needed)
    // delay(100);
}