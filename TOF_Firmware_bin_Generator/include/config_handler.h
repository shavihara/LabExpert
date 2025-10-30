#ifndef CONFIG_HANDLER_H
#define CONFIG_HANDLER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>

// Experiment configuration structure
struct ExperimentConfig {
    int frequency = 50;           // Hz
    int duration = 60;            // seconds
    int maxRange = 8000;          // mm
    String mode = "long";
    bool configured = false;
    int averagingSamples = 1;
    String pairedUserID = "";     // User ID this sensor is paired with
    bool userPaired = false;      // Whether sensor is currently paired with a user
};

// HTTP request handlers
void handleStatus(AsyncWebServerRequest *request);
void handleConfigure(AsyncWebServerRequest *request);
void handleCalibrate(AsyncWebServerRequest *request);
void handleStart(AsyncWebServerRequest *request);
void handleStop(AsyncWebServerRequest *request);
void handleData(AsyncWebServerRequest *request);
void handleOptions(AsyncWebServerRequest *request);
void handleId(AsyncWebServerRequest *request);
void handleUpdateUpload(AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final);
void handleUpdate(AsyncWebServerRequest *request);

// External variables
extern ExperimentConfig config;
extern AsyncWebServer server;

#endif