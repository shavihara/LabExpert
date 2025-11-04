#include <Wire.h>
#include <EEPROM.h>

// LED pin setup
#define SENSOR_LED 15

// EEPROM config
#define EEPROM_SENSOR_ADDR 0x50
#define EEPROM_SIZE 3

// Pin definitions
#define SENSOR_PIN 21
#define EEPROM_SDA 18
#define EEPROM_SCL 19

// Global variables
unsigned long lastEepromCheck = 0;
unsigned long lastSensorChange = 0;
unsigned long lastBlinkTime = 0;
int lastSensorState = -1;
bool eepromConnected = false;
bool blinkState = false;
String sensorType = "UNK";

// Function declarations
String readEEPROMData();
void checkSensorState();
void handleEEPROMCheck();
void handleLEDBlink();

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

    Serial.println("System started - EEPROM Reader Mode");
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
    }
    else
    {
        eepromConnected = false;
        data = "EEPROM_NOT_FOUND";
        Serial.println("EEPROM Communication Failed");
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
        Serial.println("Sensor state changed to: " + String(currentState ? "HIGH" : "LOW"));

        // Control LED based on sensor state - turn on when LOW
        if (currentState == HIGH)
        {
            digitalWrite(SENSOR_LED, HIGH);
        }
        else
        {
            digitalWrite(SENSOR_LED, LOW);
        }
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

            // Blink SENSOR_LED for 1 second to indicate successful read
            digitalWrite(SENSOR_LED, HIGH);
            lastBlinkTime = millis();
            blinkState = true;
        }
        else
        {
            sensorType = "UNK";
            Serial.println("EEPROM Error or Invalid Data: " + eepromData);
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

void loop()
{
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

    // Small delay to prevent overwhelming the processor
    // delay(100);
}