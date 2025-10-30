#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>

// WebSocket configuration
extern AsyncWebSocket ws;
extern WebSocketsClient backendWebSocket;

// WebSocket event handlers
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len);
void onBackendWsEvent(WStype_t type, uint8_t *payload, size_t length);

// WebSocket utility functions
void sendWS(const String& data);
void sendBinaryData(uint32_t timestamp, uint16_t distance, uint16_t sampleNumber);

// WebSocket status
extern bool wsActive;
extern unsigned long lastWSPing;

#endif