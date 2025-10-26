#pragma once
#include <Update.h>
#include <ArduinoJson.h>
#include <vector>

class OTAManager
{
public:
    bool beginOTA(size_t size);
    bool writeOTAChunk(size_t offset, size_t size, const String &hexData);
    bool endOTA();
    bool isInProgress();
    void eraseInactivePartition();
    static bool hexToBytes(const String &hex, std::vector<uint8_t> &out);

private:
    bool inProgress = false;
    size_t expectedSize = 0;
    size_t written = 0;
};