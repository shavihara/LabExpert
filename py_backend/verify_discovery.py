import asyncio
import logging
import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

from services.udp_discovery_service import udp_discovery_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_discovery():
    logger.info("Starting verification of UDP Discovery Service...")
    
    # Test 1: Standalone discovery (Service NOT running)
    logger.info("\n--- Test 1: Standalone Discovery (Service NOT running) ---")
    if udp_discovery_service.is_running:
        await udp_discovery_service.stop()
        
    devices = await udp_discovery_service.discover_devices(timeout=3)
    logger.info(f"Standalone discovery found {len(devices)} devices")
    for d in devices:
        logger.info(f" - {d.get('device_id')} at {d.get('ip_address')}")

    # Test 2: Piggyback discovery (Service RUNNING)
    logger.info("\n--- Test 2: Piggyback Discovery (Service RUNNING) ---")
    await udp_discovery_service.start()
    # Wait a bit for the service to spin up
    await asyncio.sleep(1)
    
    devices = await udp_discovery_service.discover_devices(timeout=3)
    logger.info(f"Piggyback discovery found {len(devices)} devices")
    for d in devices:
        logger.info(f" - {d.get('device_id')} at {d.get('ip_address')}")
        
    await udp_discovery_service.stop()
    logger.info("\nVerification completed.")

if __name__ == "__main__":
    asyncio.run(test_discovery())
