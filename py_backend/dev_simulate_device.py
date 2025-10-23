import asyncio
import json
import websockets

WS_URL = "ws://localhost:5000/ws/device?device_id=ESP32SIM"

async def main():
    async with websockets.connect(WS_URL) as ws:
        # Send sensor_id to trigger OTA selection
        msg = {"type": "sensor_id", "sensor_id": "TOF_SIM"}
        await ws.send(json.dumps(msg))
        print("Sent:", msg)
        # Wait for OTA command or any response
        try:
            resp = await asyncio.wait_for(ws.recv(), timeout=5)
            print("Received:", resp)
        except asyncio.TimeoutError:
            print("No response within timeout; backend may have no firmware for sensor.")

if __name__ == "__main__":
    asyncio.run(main())