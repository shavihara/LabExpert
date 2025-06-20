import requests
import time
import json
from pathlib import Path

ESP32_IP = "192.168.137.15"  # static IP ESP32 connects with
BIN_FOLDER = Path("bin")


def get_device_id():
    try:
        r = requests.get(f"http://{ESP32_IP}/id", timeout=5)
        r.raise_for_status()
        return r.json().get("id")
    except Exception as e:
        print(f"[✘] Failed to get device ID: {e}")
        return None


def upload_firmware(bin_path):
    url = f"http://{ESP32_IP}/update"
    try:
        with open(bin_path, 'rb') as f:
            files = {'update': (bin_path.name, f, 'application/octet-stream')}
            r = requests.post(url, files=files, timeout=30)
            if r.ok:
                print("[✔] OTA upload successful. Rebooting ESP32...")
                time.sleep(5)
                return True
            else:
                print(f"[✘] OTA failed with status {r.status_code}: {r.text}")
                return False
    except Exception as e:
        print(f"[✘] OTA upload error: {e}")
        return False


def collect_displacement():
    print("[*] Starting displacement mode...")
    try:
        r = requests.get(f"http://{ESP32_IP}/start", timeout=5)
        if r.ok:
            print("[✔] Data collection started.")
        else:
            print("[✘] Failed to start collection.")
            return

        while True:
            r = requests.get(f"http://{ESP32_IP}/status", timeout=5)
            status = r.json()
            print(f"  Samples: {status['samples']}/{status['max_samples']}...")
            if status['ready']:
                break
            time.sleep(0.5)

        r = requests.get(f"http://{ESP32_IP}/data", timeout=10)
        data = r.json()
        distances = data["distances"]

        print("\n===== Displacement Data =====")
        for i, d in enumerate(distances):
            print(f"{i+1:02}: {d} mm")

    except Exception as e:
        print(f"[✘] Error collecting displacement: {e}")


def collect_oscillations(n=3):
    print("[*] Collecting oscillation times...")
    for i in range(n):
        try:
            r = requests.get(f"http://{ESP32_IP}/start_oscillation", timeout=5)
            time.sleep(3)  # wait for 20 oscillations

            r = requests.get(f"http://{ESP32_IP}/oscillation_data", timeout=10)
            result = r.json()

            print(f"\nOscillation Set {i+1}:")
            for j, t in enumerate(result['times_ms']):
                print(f"  {j+1:02}: {t:.2f} ms")
        except Exception as e:
            print(f"[✘] Error in oscillation {i+1}: {e}")


def main():
    print("ESP32 Terminal Client")

    device_id = get_device_id()
    if not device_id:
        return

    print(f"[✔] Device ID: {device_id}")

    bin_path = BIN_FOLDER / f"{device_id}.bin"
    if not bin_path.exists():
        print(f"[✘] Firmware file '{bin_path}' not found.")
        return

    if not upload_firmware(bin_path):
        return

    while True:
        print("\n== Modes ==")
        print("1. Displacement Mode")
        print("2. Oscillation Mode")
        print("0. Exit")
        choice = input(">> ").strip()

        if choice == "1":
            collect_displacement()
        elif choice == "2":
            collect_oscillations()
        elif choice == "0":
            break
        else:
            print("Invalid option.")


if __name__ == "__main__":
    main()
