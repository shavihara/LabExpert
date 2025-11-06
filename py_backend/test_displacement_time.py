import asyncio
from processor.sensor_displacement import DisplacementProcessor


async def run_test():
    proc = DisplacementProcessor("test_device")
    proc.start_experiment()

    # Simulate legacy format packets with slightly jittery times
    legacy_packets = [
        {"t": 0.03, "x": 84.05},
        {"t": 0.13, "x": 83.35},
        {"t": 0.23, "x": 83.42},
    ]

    print("Legacy format test:")
    for p in legacy_packets:
        out = await proc.process_data(p)
        print(out)

    # Reset and test MQTT binary-like format (timestamp in ms)
    proc.reset_analysis()
    mqtt_packets = [
        {"timestamp": 30.0, "distance": 84.05, "sample": 101},
        {"timestamp": 130.0, "distance": 83.35, "sample": 102},
        {"timestamp": 230.0, "distance": 83.42, "sample": 103},
    ]
    print("\nMQTT format test:")
    for p in mqtt_packets:
        out = await proc.process_data(p)
        print(out)

    # Without calling reset/start, simulate a device-side retry where sample resets to 1
    mqtt_retry_packets = [
        {"timestamp": 330.0, "distance": 84.05, "sample": 1},
        {"timestamp": 430.0, "distance": 83.35, "sample": 2},
    ]
    print("\nMQTT retry (sample resets to 1) without backend reset:")
    for p in mqtt_retry_packets:
        out = await proc.process_data(p)
        print(out)


if __name__ == "__main__":
    asyncio.run(run_test())