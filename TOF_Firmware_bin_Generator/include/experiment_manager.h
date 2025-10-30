#ifndef EXPERIMENT_MANAGER_H
#define EXPERIMENT_MANAGER_H

#include <Arduino.h>

// Experiment constants
const int MAX_SAMPLES = 1000;

// Experiment data structures
extern float distances[MAX_SAMPLES];
extern unsigned long timestamps[MAX_SAMPLES];
extern int sampleCount;

// Experiment state variables
extern bool experimentRunning;
extern bool dataReady;
extern unsigned long experimentStartTime;
extern unsigned long lastSampleTime;
extern int sampleInterval;

// Sensor detection variables
extern unsigned long lastSensorCheck;
extern const unsigned long SENSOR_CHECK_INTERVAL;
extern bool sensorWasPresent;
extern unsigned long lastExperimentEnd;

// Backend cleanup flag
extern bool backendCleanupRequested;

// Experiment management functions
void manageExperimentLoop();
void checkSensorStatus();
void handleBackendCleanup();

#endif