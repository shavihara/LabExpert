import asyncio
from typing import List, Dict, Optional, Callable
from bleak import BleakScanner, BleakClient
from typing import Optional, Callable, List, Dict

SERVICE_UUID = "0000FFF0-0000-1000-8000-00805F9B34FB"
CHAR_SSID = "0000FFF1-0000-1000-8000-00805F9B34FB"
CHAR_PASS = "0000FFF2-0000-1000-8000-00805F9B34FB"
CHAR_STATUS = "0000FFF3-0000-1000-8000-00805F9B34FB"
CHAR_COMMIT = "0000FFF4-0000-1000-8000-00805F9B34FB"
CHAR_HOSTMAC = "0000FFF5-0000-1000-8000-00805F9B34FB"

class BLEService:
    def __init__(self, secret: bytes):
        self.secret = secret

    async def is_adapter_ready(self) -> bool:
        try:
            devices = await BleakScanner.discover(timeout=1.0)
            return True
        except Exception:
            return False

    async def scan(self, timeout: float = 10.0) -> List[Dict]:
        found = []
        devices = await BleakScanner.discover(timeout=timeout)
        for d in devices:
            name = d.name or ""
            if name.startswith("LabExpertOTA"):
                found.append({"name": name, "address": d.address, "rssi": getattr(d, "rssi", None)})
        return found

    async def provision(self, address: str, ssid: str, password: str, host_mac: Optional[str] = None, status_cb: Optional[Callable[[str], None]] = None, timeout: float = 30.0) -> Dict:

        async def notify(sender: int, data: bytearray):
            if status_cb:
                try:
                    status_cb(data.decode("utf-8", errors="ignore"))
                except Exception:
                    pass

        async with BleakClient(address) as client:
            await client.start_notify(CHAR_STATUS, notify)
            await client.write_gatt_char(CHAR_SSID, ssid.encode("utf-8"))
            await client.write_gatt_char(CHAR_PASS, password.encode("utf-8"))
            if host_mac:
                try:
                    await client.write_gatt_char(CHAR_HOSTMAC, host_mac.encode("utf-8"))
                except Exception:
                    pass
            await client.write_gatt_char(CHAR_COMMIT, b"commit")

            end_time = asyncio.get_event_loop().time() + timeout
            final_status = None
            while asyncio.get_event_loop().time() < end_time:
                await asyncio.sleep(0.2)
                try:
                    val = await client.read_gatt_char(CHAR_STATUS)
                    s = val.decode("utf-8", errors="ignore")
                    if s in ("STORED", "NVS_ERR", "INVALID_SSID", "INVALID_PASS", "TIMEOUT", "RATE_LIMITED", "WIFI_OK", "WIFI_FAIL"):
                        final_status = s
                        break
                except Exception:
                    pass
            await client.stop_notify(CHAR_STATUS)

        if final_status is None:
            return {"success": False, "message": "timeout"}
        ok = final_status in ("WIFI_OK", "STORED")
        return {"success": ok, "message": final_status}
