#include "OTAManager.h"
#include "Config.h"
#include "esp_partition.h"
#include "esp_ota_ops.h"

bool OTAManager::hexToBytes(const String& hex, std::vector<uint8_t>& out) {
    if (hex.length() % 2 != 0) return false;
    out.clear();
    out.reserve(hex.length()/2);
    auto toNib = [](char c)->int {
        if (c>='0' && c<='9') return c-'0';
        if (c>='a' && c<='f') return 10 + (c-'a');
        if (c>='A' && c<='F') return 10 + (c-'A');
        return -1;
    };
    for (size_t i=0;i<hex.length();i+=2) {
        int n1 = toNib(hex[i]);
        int n2 = toNib(hex[i+1]);
        if (n1<0 || n2<0) return false;
        out.push_back((uint8_t)((n1<<4)|n2));
    }
    return true;
}

bool OTAManager::beginOTA(size_t size) {
    const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);
    if (!Update.begin(size)) {
        Update.printError(Serial);
        return false;
    }
    inProgress = true;
    expectedSize = size;
    written = 0;
    Serial.printf("OTA begin: size=%u, partition=%s\n", (unsigned)size, next->label);
    return true;
}

bool OTAManager::writeOTAChunk(size_t offset, size_t size, const String& hexData) {
    if (!inProgress) {
        Serial.println("OTA write: No OTA in progress");
        return false;
    }
    
    std::vector<uint8_t> bytes;
    if (!hexToBytes(hexData, bytes)) {
        Serial.println("OTA write: Bad hex data");
        return false;
    }
    if (bytes.size() != size) {
        Serial.println("OTA write: Size mismatch");
        return false;
    }
    
    size_t result = Update.write(bytes.data(), bytes.size());
    if (result != bytes.size()) {
        Update.printError(Serial);
        return false;
    }
    written += result;
    return true;
}

bool OTAManager::endOTA() {
    if (!inProgress) {
        Serial.println("OTA end: No OTA in progress");
        return false;
    }
    
    bool success = Update.end(true);
    inProgress = false;
    
    if (success) {
        Serial.printf("OTA success: %u/%u bytes\n", (unsigned)written, (unsigned)expectedSize);
        delay(200);
        ESP.restart();
    } else {
        Update.printError(Serial);
    }
    return success;
}

bool OTAManager::isInProgress() { 
    return inProgress; 
}

void OTAManager::eraseInactivePartition() {
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *ota_0 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    const esp_partition_t *ota_1 = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);

    const esp_partition_t *inactive = (running == ota_0) ? ota_1 : ota_0;

    if (inactive) {
        Serial.printf("Erasing inactive partition: %s\n", inactive->label);
        esp_err_t err = esp_partition_erase_range(inactive, 0, inactive->size);
        if (err == ESP_OK) {
            Serial.println("✓ Inactive partition erased successfully.");
        } else {
            Serial.printf("✘ Failed to erase inactive partition. Error: %d\n", err);
        }
    } else {
        Serial.println("✘ Could not find inactive OTA partition.");
    }
}