import paho.mqtt.client as mqtt
import json
import time

class SensorMonitor:
    def __init__(self, broker_ip, port=1883):
        self.broker_ip = broker_ip
        self.port = port
        self.client = mqtt.Client()
        
        # Set callbacks
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        
    def on_connect(self, client, userdata, flags, rc):
        print(f"Connected with result code {rc}")
        # Subscribe to sensor topics
        client.subscribe("sensor/state")
        client.subscribe("sensor/type")
        client.subscribe("sensor/eeprom")
        client.subscribe("sensor/status")
        
    def on_message(self, client, userdata, msg):
        print(f"{msg.topic}: {msg.payload.decode()}")
        
    def connect(self):
        self.client.connect(self.broker_ip, self.port, 60)
        self.client.loop_start()
        
    def send_command(self, command):
        self.client.publish("sensor/commands", command)
        print(f"Sent command: {command}")
        
    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

# Usage example
if __name__ == "__main__":
    monitor = SensorMonitor("192.168.137.1")  # Your PC's IP address
    monitor.connect()
    
    try:
        while True:
            time.sleep(10)
            # Example: Request status every 10 seconds
            monitor.send_command("status")
    except KeyboardInterrupt:
        monitor.disconnect()