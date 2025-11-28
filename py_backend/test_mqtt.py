import paho.mqtt.client as mqtt
import sys

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")
    sys.exit(0 if rc == 0 else 1)

client = mqtt.Client()
client.on_connect = on_connect

try:
    print("Connecting to 192.168.137.1:1883...")
    client.connect("192.168.137.1", 1883, 60)
    client.loop_forever()
except Exception as e:
    print(f"Connection failed: {e}")
    sys.exit(1)
