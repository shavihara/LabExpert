# main.py
# Lab Expert Backend API
import sys
#additinal--------------remark by me-----------------------------
import asyncio
asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
#------------------------------------------------------------------
from typing import Optional
import aiohttp
import asyncio
import time
import json
from datetime import datetime
import logging
from collections import deque
import numpy as np
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query, Request, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, EmailStr
import yagmail
from dotenv import load_dotenv
import os
from services.user_service import UserService
from services.session_service import SessionService
from services.otp_service import OTPService
from services.file_service import FileService
import platform
import psutil
import time
from sse_starlette.sse import EventSourceResponse # type: ignore  # Kept for OSI if needed, but TOF uses WS now
import logging
from pathlib import Path
from sensor_service import (
    get_device_id,
    upload_firmware,
    live_distance_generator,  # Now adapted for WS broadcast
    collect_displacement,
    collect_oscillations,
    check_esp32_connection,
    configure_experiment,
    start_experiment,
    stop_experiment,
    analyze_data_with_best_fit
)
from enum import Enum
import socket
from session_manager import SessionManager
from ws_client import ClientWebSocketManager
from ws_device import DeviceWebSocketManager
from ota_manager import OTAManager
from services.oscillation_service import (
    check_osi_connection,
    configure_osi_experiment,
    start_osi_experiment,
    stop_osi_experiment,
    reset_osi_count,
    live_oscillation_generator,
    get_osi_data
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env config
load_dotenv()

app = FastAPI()

# Initialize WebSocket/session managers
session_manager = SessionManager()
ota_manager = OTAManager()
client_ws_manager = ClientWebSocketManager(session_manager)
ClientWebSocketManager.set_instance(client_ws_manager)
device_ws_manager = DeviceWebSocketManager(session_manager, ota_manager)
DeviceWebSocketManager.set_instance(device_ws_manager)

async def periodic_cleanup():
    while True:
        await session_manager.cleanup_expired_allocations()
        await asyncio.sleep(60)  # Run every 60 seconds

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(periodic_cleanup())

# Add this at the top with other constants
ESP32_IP = "192.168.137.15"  # Add this line
ESP32_WS_URL = f"ws://{ESP32_IP}/ws"  # Add this line

# Feature flag to enable/disable sensor WS bridge
ENABLE_SENSOR_WS = os.getenv("ENABLE_SENSOR_WS", "false").lower() in ("true", "1", "yes")

# Get local IP address
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"


LOCAL_IP = get_local_ip()
logger.info(f"🌐 Local IP Address: {LOCAL_IP}")

# ------------------ CORS ------------------
# UPDATED: Allow WS upgrades
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        f"http://{LOCAL_IP}:5173",
        f"http://{LOCAL_IP}:5174",
        f"http://{LOCAL_IP}:5175",
        f"http://{LOCAL_IP}:3000",
        "http://192.168.137.1:3000",
        "http://192.168.1.198:3000",
        "http://192.168.1.*:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Uncaught exception for request {request.url}: {str(exc)}", exc_info=True)
    origin = request.headers.get("origin", "http://localhost:5173")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )


# ------------------ Models ------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class OTPVerifyRequest(BaseModel):
    otp: str
    email: EmailStr


class ExperimentConfig(BaseModel):
    frequency: int
    duration: int
    mode: str = "distance"


class ExperimentData(BaseModel):
    data: list
    metadata: dict = {}

# This new model will be used for the analysis endpoint
class AnalysisRequest(BaseModel):
    data: list

# ------------------ Auth ------------------
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    if not token:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    session = SessionService.find_by_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = UserService.find_by_id(session['user_id'])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    SessionService.update_activity(token)
    return user


async def get_current_user_sensor(authorization: str = Header(None), token: str = Query(None)):
    token_to_use = authorization or token
    if not token_to_use:
        raise HTTPException(status_code=401, detail="No token provided")

    if token_to_use.startswith("Bearer "):
        token_to_use = token_to_use.split(" ")[1]

    logger.debug(f"Token used for sensor: {token_to_use}")
    session = SessionService.find_by_token(token_to_use)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = UserService.find_by_id(session['user_id'])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    SessionService.update_activity(token_to_use)
    return user


# ------------------ WebSocket Manager for TOF Streaming ------------------
# NEW: Manages WS connections and broadcasts processed sensor data
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, token: str):
        # Authenticate via token query param
        session = SessionService.find_by_token(token)
        if not session:
            await websocket.close(code=1008, reason="Invalid token")
            return
        user = UserService.find_by_id(session['user_id'])
        if not user:
            await websocket.close(code=1008, reason="User not found")
            return
        
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS Client connected: {user['email']}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info("WS Client disconnected")

    async def broadcast(self, data: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.active_connections.remove(conn)

manager = ConnectionManager()

@app.websocket("/ws/sensor")
async def websocket_sensor(websocket: WebSocket, token: str = Query(...)):
    # Accept and short-circuit when disabled to avoid noisy errors in dev
    await manager.connect(websocket, token)
    if not ENABLE_SENSOR_WS:
        try:
            await websocket.send_json({
                "event": "error",
                "data": {"error": "Sensor WS bridge disabled (set ENABLE_SENSOR_WS=true to enable)"}
            })
        except Exception:
            # ignore send errors
            pass
        await websocket.close(code=1001, reason="Sensor WS disabled")
        return

    try:
        from sensor_service import physics_processor
        physics_processor.reset()
        logger.info("Attempting to connect to ESP32 WebSocket...")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(ESP32_WS_URL, timeout=aiohttp.ClientTimeout(total=10)) as esp32_ws:
                    logger.info("Connected to ESP32 WebSocket")
                    await manager.broadcast({
                        "event": "connected",
                        "data": {"message": "Connected to ESP32 sensor"}
                    })
                    async for msg in esp32_ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            try:
                                data = json.loads(msg.data)
                                logger.info(f"Received from ESP32: {data}")
                                if "distance" in data and "timestamp" in data:
                                    timestamp_ms = data["timestamp"]
                                    processed = physics_processor.process_reading(
                                        data["distance"],
                                        timestamp_ms
                                    )
                                    if processed:
                                        logger.info(f"Sending processed data: {processed}")
                                        await manager.broadcast(processed)
                                else:
                                    await manager.broadcast(data)
                            except json.JSONDecodeError as e:
                                logger.error(f"Invalid JSON from ESP32: {msg.data} - {e}")
                                await manager.broadcast({
                                    "event": "error",
                                    "data": {"error": "Invalid data from sensor"}
                                })
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            logger.error("ESP32 WebSocket error")
                            await manager.broadcast({
                                "event": "error",
                                "data": {"error": "ESP32 connection error"}
                            })
                            break
                        elif msg.type == aiohttp.WSMsgType.CLOSED:
                            logger.info("ESP32 WebSocket closed")
                            break
        except Exception as e:
            logger.error(f"Failed to connect to ESP32 WebSocket: {e}")
            await manager.broadcast({
                "event": "error",
                "data": {"error": f"Cannot connect to ESP32: {str(e)}"}
            })
    except WebSocketDisconnect:
        logger.info("Client WebSocket disconnected")
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await manager.broadcast({
            "event": "error",
            "data": {"error": str(e)}
        })
        manager.disconnect(websocket)

@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket, token: str = Query(...)):
    # Authenticate via token
    session = SessionService.find_by_token(token)
    if not session:
        await websocket.close(code=1008, reason="Invalid token")
        return
    user_id = session['user_id']
    await client_ws_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            await client_ws_manager.handle_client_message(websocket, user_id, data)
            # Keep session alive
            SessionService.update_activity(token)
    except WebSocketDisconnect:
        await client_ws_manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WS client error for user {user_id}: {e}")
        await client_ws_manager.disconnect(user_id)
@app.websocket("/ws/device")
async def websocket_device(websocket: WebSocket, device_id: str = Query(...)):
    # Register and accept device connection
    await device_ws_manager.connect(websocket, device_id)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
                await device_ws_manager.handle_device_message(websocket, device_id, data)
            except asyncio.TimeoutError:
                continue
            except OSError as e:
                if e.winerror == 121:
                    logger.warning(f"Semaphore timeout for device {device_id} during receive, ignoring and continuing")
                    continue
                else:
                    raise
    except WebSocketDisconnect:
        await device_ws_manager.disconnect(device_id)
    except Exception as e:
        logger.error(f"WS device error for {device_id}: {e}")
        await device_ws_manager.disconnect(device_id)
@app.get("/")
async def root():
    return {
        "success": True,
        "message": "Lab Expert API is running",
        "local_ip": LOCAL_IP,
        "access_urls": [
            f"http://localhost:5000",
            f"http://{LOCAL_IP}:5000"
        ]
    }


@app.get("/api/user/me")
async def get_me(current_user=Depends(get_current_user)):
    return {"success": True, "user": current_user}


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    user = UserService.find_by_email(req.email)
    if not user or not UserService.validate_password(req.password, user['password']):
        raise HTTPException(401, "Invalid credentials")

    UserService.update_last_login(user['id'])
    ip_address = request.client.host
    token = SessionService.create(user['id'], ip_address)

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "role": user['role'],
        },
    }


@app.post("/api/auth/signup")
async def signup(req: SignupRequest):
    existing = UserService.find_by_email(req.email)
    if existing:
        raise HTTPException(400, "Email already exists")

    user = UserService.create(
        {"name": req.name, "email": req.email, "password": req.password}
    )
    token = SessionService.create(user['id'], "127.0.0.1")

    return {
        "success": True,
        "token": token,
        "user": {"id": user['id'], "name": req.name, "email": req.email},
    }


@app.get("/api/auth/check-email")
async def check_email(email: EmailStr = Query(...)):
    user = UserService.find_by_email(email)
    return {"exists": bool(user)}


@app.get("/api/auth/setup-otp")
async def setup_otp(current_user=Depends(get_current_user)):
    secret = OTPService.generate_secret(current_user['id'])
    qr_path = OTPService.get_qr_code(current_user['email'], secret)
    return {"success": True, "qr_url": qr_path}


@app.post("/api/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest):
    logger.debug(f"Received verify-otp request: {req.dict()}")
    try:
        user = UserService.find_by_email(req.email)
        if not user:
            logger.error(f"User not found for email: {req.email}")
            raise HTTPException(status_code=404, detail="User not found")

        if OTPService.verify_otp(user['id'], req.otp, purpose="password_reset"):
            logger.info(f"OTP verified successfully for user: {req.email}")
            return {"success": True}
        logger.warning(f"Invalid OTP for user: {req.email}")
        raise HTTPException(status_code=400, detail="Invalid OTP")
    except Exception as e:
        logger.error(f"Error in verify-otp: {str(e)}", exc_info=True)
        raise


@app.post("/api/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = UserService.find_by_email(req.email)
    if not user:
        raise HTTPException(404, "User not found")

    otp = OTPService.create_otp(user['id'], "password_reset")
    try:
        yag.send(to=req.email, subject="Reset Password", contents=f"Your OTP: {otp}")
    except Exception as e:
        raise HTTPException(500, f"Email send failed: {str(e)}")

    return {"success": True, "message": "OTP sent"}


@app.get("/api/health")
def health():
    return {
        "success": True,
        "message": "Lab Expert API is running",
        "local_ip": LOCAL_IP
    }


@app.post("/api/files/profile-picture")
async def upload_profile(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    saved = FileService.save_profile_picture(file, current_user['id'])
    return {"success": True, "file": saved}


# ------------------ Admin Routes ------------------

def require_admin(user):
    if user.get("email") != "labexpert.us@gmail.com":
        raise HTTPException(403, "Forbidden: Admins only")


@app.get("/api/admin/dashboard")
async def admin_dashboard(current_user=Depends(get_current_user)):
    require_admin(current_user)

    data = {
        "stats": {
            "totalUsers": UserService.count_all(),
            "verifiedUsers": UserService.count_verified(),
            "recentSignups": UserService.count_recent(),
            "activeSessions": SessionService.count_active(),
        },
        "recentUsers": UserService.get_recent(5),
        "activeSessions_list": SessionService.get_active(5),
    }
    return {"success": True, "data": data}


@app.get("/api/admin/users")
async def admin_users(current_user=Depends(get_current_user)):
    require_admin(current_user)
    users = UserService.get_all()
    return {"success": True, "users": users}


@app.get("/api/admin/system")
async def admin_system(current_user=Depends(get_current_user)):
    require_admin(current_user)

    uptime = time.time() - psutil.boot_time()
    memory = psutil.virtual_memory()

    system_info = {
        "database": "SQLite",
        "version": "1.0.0",
        "nodeVersion": "N/A",
        "platform": platform.system(),
        "uptime": uptime,
        "memoryUsage": {
            "rss": memory.used,
            "heapUsed": memory.active if hasattr(memory, "active") else memory.used,
            "heapTotal": memory.total,
        },
    }
    return {"success": True, "system": system_info}


# ------------------ Sensor Routes ------------------

@app.get("/api/sensor/status")
async def sensor_status(current_user=Depends(get_current_user)):
    status = await check_esp32_connection()
    return {"success": True, "status": status}


@app.post("/api/sensor/configure")
async def configure_sensor(
    config: ExperimentConfig, 
    device_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user)
):
    user_id = current_user['id']
    user_devices = await session_manager.get_user_devices(user_id)
    logger.info(f"Configure sensor for user {user_id}: allocated devices {user_devices}")
    if not user_devices:
        raise HTTPException(403, "No device allocated to this user")
    
    # Use provided device_id if it's allocated to user, else first allocated
    selected_device = None
    if device_id:
        if device_id in user_devices:
            selected_device = device_id
        else:
            raise HTTPException(403, "Specified device not allocated to this user")
    else:
        selected_device = user_devices[0]  # Default to first allocated
    
    device_status = await session_manager.get_device_status(selected_device)
    device_ip = device_status.get("ip_address")
    logger.info(f"Device {selected_device} status: {device_status}, IP: {device_ip}")
    if not device_ip:
        raise HTTPException(500, "Device IP not available")
    result = await configure_experiment(config.frequency, config.duration, device_ip, config.mode)
    if result["success"]:
        return {"success": True, "config": result["config"]}
    raise HTTPException(500, result.get("error", "Configuration failed"))


@app.post("/api/sensor/start")
async def start_sensor(current_user=Depends(get_current_user)):
    result = await start_experiment()
    if result["success"]:
        return {"success": True}
    raise HTTPException(500, result.get("error", "Failed to start experiment"))


@app.post("/api/sensor/stop")
async def stop_sensor(current_user=Depends(get_current_user)):
    result = await stop_experiment()
    if result["success"]:
        return {"success": True}
    raise HTTPException(500, result.get("error", "Failed to stop experiment"))


# UPDATED: /stream now WS endpoint - connect via ws://localhost:5000/ws/sensor?token=...
# (SSE kept for OSI if needed; remove if focusing solely on TOF)


@app.get("/api/sensor/displacement")
async def collect_displacement_endpoint(current_user=Depends(get_current_user)):
    result = await collect_displacement()
    if result["success"]:
        return {"success": True, "data": result["data"]}
    raise HTTPException(500, result.get("error", "Failed to collect displacement"))


@app.get("/api/sensor/oscillations")
async def collect_oscillations_endpoint(
        n: int = Query(3, ge=1, le=10),
        current_user=Depends(get_current_user)
):
    result = await collect_oscillations(n)
    if result["success"]:
        return {"success": True, "results": result["results"]}
    raise HTTPException(500, result.get("error", "Failed to collect oscillations"))


class UploadFirmwareRequest(BaseModel):
    device_id: Optional[str] = None

@app.post("/api/sensor/upload_firmware")
async def handle_upload_firmware(
        request: UploadFirmwareRequest = None,
        current_user=Depends(get_current_user)
):
    # Use provided device_id or try to discover one
    device_id = request.device_id
    if not device_id:
        # Fallback: try to get device ID from ESP32 (for backward compatibility)
        device_id = await get_device_id()
        if not device_id:
            raise HTTPException(500, "Failed to get device ID from ESP32. Please provide device_id parameter.")
    
    # Check if device is available and reserve it
    device = await session_manager.get_device(device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if device.get("allocated_to") and device["allocated_to"] != current_user['id']:
        raise HTTPException(409, "Device is in use by another user")
    success = await session_manager.allocate_device_to_user(device_id, current_user['id'])
    if not success:
        raise HTTPException(500, "Failed to reserve device")
    bin_path = Path("bin") / f"{device_id}.bin"
    if not bin_path.exists():
        raise HTTPException(404, f"Firmware file '{bin_path}' not found")
    success = await upload_firmware(bin_path)
    if success:
        return {"success": True, "message": "Firmware uploaded successfully"}
    else:
        raise HTTPException(500, "Firmware upload failed")


@app.post("/api/sensor/save_data")
async def save_experiment_data(data: ExperimentData, current_user=Depends(get_current_user)):
    try:
        logger.info(f"Saving experiment data for user {current_user['id']}")
        # In a real app, you would save data.data and data.metadata to the database
        return {"success": True, "message": "Data saved to profile"}
    except Exception as e:
        logger.error(f"Failed to save experiment data: {e}")
        raise HTTPException(500, f"Failed to save data: {str(e)}")

@app.post("/api/auth/logout")
async def logout(current_user=Depends(get_current_user), credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # Invalidate session using service
    session = SessionService.find_by_token(token)
    if session:
        SessionService.invalidate(token)
    
    # Release any allocated devices
    await session_manager.free_user_devices(current_user['id'])
    
    return {"success": True, "message": "Logged out successfully"}

# -----> NEW ENDPOINT FOR BEST-FIT ANALYSIS <-----
@app.post("/api/sensor/analyze")
async def analyze_data(request: AnalysisRequest, current_user=Depends(get_current_user)):
    try:
        logger.info(f"Analyzing data for user {current_user['id']}")
        analyzed_data = analyze_data_with_best_fit(request.data)
        return {"success": True, "data": analyzed_data}
    except Exception as e:
        logger.error(f"Failed to analyze data: {e}", exc_info=True)
        raise HTTPException(500, f"Failed to analyze data: {str(e)}")
# ---------------------------------------------
    
# ------------------ OSI Sensor Routes ------------------ (Unchanged, uses HTTP/SSE for now)

@app.get("/api/osi/status")
async def osi_status(current_user=Depends(get_current_user)):
    status = await check_osi_connection()
    return {"success": True, "status": status}


@app.post("/api/osi/configure")
async def configure_osi(
    config: ExperimentConfig, 
    device_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user)
):
    user_id = current_user['id']
    user_devices = await session_manager.get_user_devices(user_id)
    logger.info(f"Configure OSI for user {user_id}: allocated devices {user_devices}")
    if not user_devices:
        raise HTTPException(403, "No device allocated to this user")
    
    # Use provided device_id if it's allocated to user, else first allocated
    selected_device = None
    if device_id:
        if device_id in user_devices:
            selected_device = device_id
        else:
            raise HTTPException(403, "Specified device not allocated to this user")
    else:
        selected_device = user_devices[0]  # Default to first allocated
    
    device_status = await session_manager.get_device_status(selected_device)
    device_ip = device_status.get("ip_address")
    logger.info(f"Device {selected_device} status: {device_status}, IP: {device_ip}")
    if not device_ip:
        raise HTTPException(500, "Device IP not available")
    result = await configure_osi_experiment(config.frequency, config.duration, device_ip)
    if result["success"]:
        return {"success": True, "config": result["config"]}
    raise HTTPException(500, result.get("error", "Configuration failed"))


@app.post("/api/osi/start")
async def start_osi(current_user=Depends(get_current_user)):
    result = await start_osi_experiment()
    if result["success"]:
        return {"success": True}
    raise HTTPException(500, result.get("error", "Failed to start"))


@app.post("/api/osi/stop")
async def stop_osi(current_user=Depends(get_current_user)):
    result = await stop_osi_experiment()
    if result["success"]:
        return {"success": True}
    raise HTTPException(500, result.get("error", "Failed to stop"))


@app.post("/api/osi/reset")
async def reset_osi(current_user=Depends(get_current_user)):
    result = await reset_osi_count()
    if result["success"]:
        return {"success": True}
    raise HTTPException(500, result.get("error", "Failed to reset"))


@app.get("/api/osi/stream")
async def stream_osi_data(token: str = Query(None)):
    if not token:
        raise HTTPException(status_code=401, detail="No token provided")
    session = SessionService.find_by_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = UserService.find_by_id(session['user_id'])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    SessionService.update_activity(token)
    logger.debug("Starting OSI SSE stream")
    return EventSourceResponse(live_oscillation_generator())


@app.get("/api/osi/data")
async def get_osi_data_endpoint(current_user=Depends(get_current_user)):
    result = await get_osi_data()
    if result["success"]:
        return {"success": True, "data": result["data"]}
    raise HTTPException(500, result.get("error", "Failed to get data"))


@app.post("/api/osi/save_data")
async def save_osi_data(data: ExperimentData, current_user=Depends(get_current_user)):
    try:
        logger.info(f"Saving OSI data for user {current_user['id']}")
        return {"success": True, "message": "Data saved to profile"}
    except Exception as e:
        logger.error(f"Failed to save OSI data: {e}")
        raise HTTPException(500, f"Failed to save data: {str(e)}")


# -----------------------------------------------------EXPERIMENT SELECTION---------------------------------------------------------

class ExperimentType(Enum):
    DISTANCE = "distance"
    OSCILLATION = "oscillation"
    DISPLACEMENT = "displacement"


class ExperimentSelectRequest(BaseModel):
    experiment_type: ExperimentType
    device_id: Optional[str] = None


@app.post("/api/sensor/select_experiment")
async def select_experiment(
        request: ExperimentSelectRequest,
        current_user=Depends(get_current_user)
):
    try:
        # Use provided device_id or try to discover one
        device_id = request.device_id
        if not device_id:
            # Fallback: try to get device ID from ESP32 (for backward compatibility)
            device_id = await get_device_id()
            if not device_id:
                raise HTTPException(500, "Failed to get device ID from ESP32. Please provide device_id parameter.")

        # Check if device is available and reserve it
        device = await session_manager.get_device(device_id)
        if not device:
            raise HTTPException(404, "Device not found")
        logger.info(f"Select experiment for user {current_user['id']}: Requesting device {device_id}, current allocation: {device.get('allocated_to')}")
        if device.get("allocated_to") == current_user['id']:
            logger.info(f"Device {device_id} already allocated to user {current_user['id']}, skipping re-allocation")
            success = True
        else:
            if device.get("allocated_to"):
                raise HTTPException(409, "Device is in use by another user")
            success = await session_manager.allocate_device_to_user(device_id, current_user['id'])
        if not success:
            raise HTTPException(500, "Failed to reserve device")
        
        # Resolve experiment mapping to OTA manager keys
        exp = request.experiment_type
        if exp == ExperimentType.DISTANCE:
            ota_key = "displacement"  # TOF
        elif exp == ExperimentType.OSCILLATION:
            ota_key = "oscillation"
        elif exp == ExperimentType.DISPLACEMENT:
            ota_key = "displacement"
        else:
            raise HTTPException(400, f"Unknown experiment type: {exp}")

        # Try device-specific firmware first (e.g., 834E8.bin / 834E8_OSC.bin)
        device_fw_map = {
            ExperimentType.DISTANCE: f"{device_id}.bin",
            ExperimentType.OSCILLATION: f"{device_id}_OSC.bin",
            ExperimentType.DISPLACEMENT: f"{device_id}.bin"
        }
        firmware_file = device_fw_map.get(exp)
        device_specific_path = Path("bin") / (firmware_file or "")
        firmware_path_override = str(device_specific_path) if device_specific_path.exists() else None

        # Find device IP from session manager (fallback to constant)
        status = await session_manager.get_device_status(device_id)
        ip = None
        if status:
            ip = status.get("status", {}).get("ip_address") or status.get("ip_address")
        device_ip = ip or ESP32_IP
        if not device_ip:
            raise HTTPException(500, "Device IP not available")

        # Kick off OTA via OTAManager (explicit firmware when available)
        logger.info(f"Starting OTA update for {exp.value} on device {device_id} at IP {device_ip}, firmware override: {firmware_path_override}")
        result = await ota_manager.start_ota_update(
            device_id=device_id,
            device_ip=device_ip,
            experiment_type=ota_key,
            firmware_path=firmware_path_override
        )
        
        if result.get("status") == "success" or result.get("success"):
                logger.info(f"Successfully selected and flashed device {device_id} for user {current_user['id']}")

                # Re-ensure allocation after OTA only if not already allocated to the user
                device = await session_manager.get_device(device_id)
                if device and device.get("allocated_to") != current_user['id']:
                    success = await session_manager.allocate_device_to_user(device_id, current_user['id'])
                    if not success:
                        raise HTTPException(500, "Failed to re-reserve device after OTA")

                # Update device status and DB after successful OTA, ensuring availability=0
                expected_sensor_type = {
                    "displacement": "TOF",
                    "oscillation": "OSI"
                }.get(ota_key, "UNKNOWN")

                await session_manager.update_device_status(device_id, {"sensor_type": expected_sensor_type, "firmware_version": "1.0.0"})

                from ws_client import ClientWebSocketManager
                client_manager = ClientWebSocketManager.get_instance()
                if client_manager:
                    await client_manager.broadcast_device_list()

                from datetime import datetime
                from sqlalchemy import text
                from config.database import engine
                now = datetime.now().isoformat()
                firmware_name = expected_sensor_type
                update_stmt = text("""
                    UPDATE available_sensors 
                    SET availability = 0, last_firmware = :firmware, last_updated = :now
                    WHERE sensor_id = :device_id
                """)
                with engine.begin() as conn:
                    conn.execute(update_stmt, {"device_id": device_id, "firmware": firmware_name, "now": now})

                return {
                    "success": True,
                    "message": f"Firmware flashed successfully for {exp.value} on {device_id}",
                    "device_id": device_id,
                    "ip": device_ip
                }
        else:
            err = result.get("message") or result.get("error") or "OTA failed"
            await session_manager.free_device(device_id)  # Cleanup on failure
            raise HTTPException(500, err)
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error in select_experiment: {str(e)}")
        if device_id:
            await session_manager.free_device(device_id)
        raise HTTPException(500, str(e))


@app.get("/api/sensor/available_experiments")
async def get_available_experiments(
        device_id: Optional[str] = Query(None),
        current_user=Depends(get_current_user)
):
    # Use provided device_id or try to discover one
    if not device_id:
        device_id = await get_device_id()
        if not device_id:
            return {"success": False, "experiments": [], "message": "No device ID provided and failed to discover device"}

    bin_folder = Path("bin")
    available = []
    experiments = [
        {"type": "distance", "file": f"{device_id}.bin", "name": "Distance Measurement"},
        {"type": "oscillation", "file": f"{device_id}_OSC.bin", "name": "Oscillation Timing"},
        {"type": "displacement", "file": f"{device_id}.bin", "name": "Displacement Analysis"}
    ]

    for exp in experiments:
        if (bin_folder / exp["file"]).exists():
            available.append({
                "type": exp["type"],
                "name": exp["name"],
                "firmware": exp["file"]
            })

    return {"success": True, "experiments": available}


# ------------------ Email Setup ------------------
yag = None
try:
    yag = yagmail.SMTP(os.getenv("EMAIL_USER"), os.getenv("EMAIL_PASS"))
    # yag.send(to=os.getenv("EMAIL_USER"), subject="LAB EXPERT ONLINE!", contents="Email config OK")
    print("✅ Email server ready")
except Exception as e:
    print(f"❌ Email config error: {e}")


# ------------------ Startup Event ------------------
@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🚀 Lab Expert API Starting... (WebSocket Enabled)")
    logger.info(f"🌐 Local Network IP: {LOCAL_IP}")
    logger.info(f"📱 Access from phone: http://{LOCAL_IP}:5000")
    logger.info(f"💻 Access from PC: http://localhost:5000")
    logger.info(f"🔌 WS Sensor Endpoint: ws://{LOCAL_IP}:5000/ws/sensor?token=...")
    logger.info(f"🔌 WS Client Endpoint: ws://{LOCAL_IP}:5000/ws/client?token=...")
    logger.info(f"🔌 WS Device Endpoint: ws://{LOCAL_IP}:5000/ws/device?device_id=...")
    logger.info("=" * 60)


# ------------------ Run ------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        log_level="info"
    )


# ------------------ Firmware Serving ------------------
@app.get("/api/firmware/{sensor_id}")
async def get_firmware_file(sensor_id: str, current_user=Depends(get_current_user)):
    path = ota_manager.get_firmware_for_sensor(sensor_id)
    if not path:
        raise HTTPException(404, f"No firmware mapped for sensor: {sensor_id}")
    return FileResponse(path, media_type="application/octet-stream", filename=os.path.basename(path))