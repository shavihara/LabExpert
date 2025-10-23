# ESP32 - Backend - Frontend Full Structure Blueprint

## 1️⃣ ESP32 Layer (PlatformIO)

### Folder Structure
```markdown
esp32_project/
├── platformio.ini
├── src/
│   ├── main.cpp                  # Entry point (permanent OTA boot)
│   ├── ota_partition.cpp         # Permanent OTA logic
│   ├── temp_firmware.cpp         # Temporary firmware template
│   ├── sensors/
│   │   ├── tof_sensor.cpp        # TOF sensor read logic
│   │   ├── oscillation_sensor.cpp # LDR/laser read logic
│   │   └── disp_angle_sensor.cpp  # Displacement + Angle sensor logic
│   ├── ws_client.cpp             # WebSocket client
│   ├── eeprom_manager.cpp        # Read/write sensor EEPROM IDs
│   └── packet.h                  # Binary struct definitions
└── lib/                           # Optional external libraries
```

### ESP32 Flow
1. Boot → permanent OTA partition
2. Read sensor EEPROM → get sensor ID
3. Connect to backend via WebSocket
4. Send sensor ID → backend selects `.bin`
5. Flash temporary partition with firmware
6. Reboot → temporary firmware runs
7. Sensor disconnect → reboot OTA, erase temporary partition

### Binary Packets
```c
struct TOFData { float t; float x; };
struct OscillationData { float cut_time; };
struct DispAngleData { float t; float x; float angle; };
```

---

## 2️⃣ Python Backend (FastAPI + WebSocket + SQLite)

### Folder Structure
```markdown
backend/
├── main.py                     # FastAPI entry point
├── ws_device.py                # WebSocket server for ESP32
├── ws_client.py                # WebSocket server for React frontend
├── ota_manager.py              # Handle OTA requests
├── session_manager.py          # Active user sessions & ESP32 allocation
├── database.py                 # SQLite for user/device info
├── processor/                  # Sensor-specific processing
│   ├── __init__.py
│   ├── sensor_base.py
│   ├── sensor_displacement.py
│   ├── sensor_oscillation.py
│   └── sensor_disp_angle.py
└── utils/
    ├── packet.py               # Binary pack/unpack
    └── config.py               # Paths, constants, bin folder
```

### Backend Flow
1. User logs in → session created in SQLite
2. User scans → backend lists ESP32s with MAC last 5 digits
3. User selects an ESP32 → backend locks device to user session
4. ESP32 sends sensor ID → backend selects proper `.bin`
5. OTA partition → temporary firmware → backend tracks partition
6. ESP32 sends binary data → processor module computes results
7. Processed data broadcast via WebSocket to frontend
8. Disconnect/logout → device freed

---

## 3️⃣ React Frontend (Web UI)

### Folder Structure
```markdown
frontend/
├── package.json
├── src/
│   ├── App.jsx
│   ├── index.jsx
│   ├── components/
│   │   ├── LoginForm.jsx
│   │   ├── ScanDevice.jsx
│   │   ├── DeviceControl.jsx
│   │   ├── LiveGraph.jsx
│   │   ├── TOFGraph.jsx
│   │   ├── OscillationGraph.jsx
│   │   └── DispAngleGraph.jsx
│   ├── hooks/
│   │   └── useWebSocket.js
│   └── utils/
│       └── dataProcessing.js
```

### Frontend Flow
1. Login → API request → session token
2. Scan → fetch available ESP32s (MAC last 5 digits)
3. Select device → backend locks it
4. Subscribe to WebSocket → receive processed data
5. Experiment-specific components
   - TOF → `TOFGraph.jsx` → shows displacement, velocity, acceleration
   - Oscillation → `OscillationGraph.jsx` → shows periods, average time
   - Displacement+Angle → `DispAngleGraph.jsx` → shows energy, forces, angle
6. Disconnect → backend releases ESP32, unsubscribe WebSocket

---

## 4️⃣ Modular Sensor Processor (Backend)

### Sensor Modules
| Experiment | ESP32 Data | User Input | Backend Processor | Output |
|------------|------------|------------|-----------------|--------|
| TOF / Displacement | t, x | None | sensor_displacement.py | t, x, v, a |
| Oscillation Counter | cut_times | Measurement setup | sensor_oscillation.py | avg_period, periods |
| Displacement + Angle | t, x, angle | Object weight | sensor_disp_angle.py | t, x, angle, energy, forces |

- Each ESP32 connection has its own processor instance
- Backend dynamically loads the correct processor based on `.bin` or sensor ID
- Multi-user safe → each ESP32 instance independent

---

## 5️⃣ Session & Device Management
```python
 devices = {
     "AB12C": {"status": "free", "user": None, "sensor_id": "TOF_SENSOR"},
     "DE34F": {"status": "busy", "user": "user01", "sensor_id": "OSCILLATION_SENSOR"}
 }

 sessions = {
     "user01": {"esp_id": "DE34F", "login_time": "...", "active": True}
 }
```
- Backend checks status before assignment
- Disconnect → mark status = free, remove session mapping

---

## 6️⃣ Data Flow Overview
```
ESP32 (sensor) 
   ↓ binary frames
Backend (FastAPI + WebSocket)
   ├─ OTA manager → select proper .bin
   ├─ Sensor processor → per-ESP32 instance
   ↓ processed JSON
Frontend (React)
   ├─ Graph component per experiment type
   └─ Real-time visualization
```
- All processors per ESP32 → no cross-user interference
- Modular → easy to add new sensors/experiments

---

## 7️⃣ Key Principles
1. Dual Partition OTA → permanent failsafe
2. Binary WebSocket streaming → real-time, low-latency
3. Processor per ESP32 instance → safe multi-user operation
4. Modular per experiment → easier maintenance and extension
5. Frontend components per experiment → clean separation for UI
6. Session management + device registry → prevents collisions

