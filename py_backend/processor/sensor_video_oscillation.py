import asyncio
import base64
import threading
import time
from typing import Optional, Tuple, List, Dict
import cv2
import numpy as np
from collections import deque
from .sensor_base import SensorProcessor
from ws_client import ClientWebSocketManager
from session_manager import SessionManager

class VideoOscillationProcessor(SensorProcessor):
    def __init__(self, device_id: str):
        super().__init__(device_id)
        self.experiment_type = "video_oscillation"
        self.cap: Optional[cv2.VideoCapture] = None
        self.loop = None
        self.worker: Optional[threading.Thread] = None
        self.preview_fps = 10
        self._last_preview_ts = 0.0
        self._stop_event = threading.Event()
        self.data_fps = 15
        self._last_data_ts = 0.0
        
        # Tracking State (Ported from PendulumTracker)
        self.lower_color = np.array([0, 100, 50])
        self.upper_color = np.array([50, 255, 255])
        
        self.positions = deque(maxlen=300)  # y-positions
        self.timestamps = deque(maxlen=300)  # relative timestamps
        self.periods = deque(maxlen=10)
        
        self.tracking = False
        self.start_time = None
        self._start_monotonic = None
        
        self.last_extreme = None
        self.last_extreme_time = None
        self.last_extreme_type = None  # 'min' or 'max'
        self.extreme_points = []
        self.current_period = None
        
        # Kalman Filter
        self.kalman = cv2.KalmanFilter(4, 2)
        self.kalman.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
        self.kalman.transitionMatrix = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)
        self.kalman.processNoiseCov = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32) * 0.03
        self.kalman_initialized = False
        self.predicted_position = None
        
        # Adaptive Color
        self.adaptive_color = False
        self.color_history = deque(maxlen=5)
        
        # Tracking Mode
        self.tracking_mode = "color"
        self.exclude_skin = True
        self.min_circularity = 0.45
        self.aruco_id = None
        self.aruco_dict_name = "DICT_4X4_50"
        self._aruco_dict = None
        self._aruco_params = None
        
        # Auto mode support
        self._bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=25, detectShadows=False)
        self._auto_initialized = False
        self._auto_last_init_ts = 0.0
        self._auto_hsv_margin = (10, 40, 40)
        
        # Visual Tracker (CSRT/KCF/MOSSE)
        self.tracker = None
        self.tracker_mode = None
        self.tracker_bbox = None
        self.tracker_initialized = False
        self.tracker_last_ok_ts = 0.0
        
        # Thread safety for MJPEG streaming
        self.lock = threading.Lock()
        self.processed_frame = None
        
        self.recording = False
        self.disabled = False
        
        self.midline_margin = 10
        self.last_sign = None
        self.counting_started = False
        self.crossing_count = 0
        self.oscillation_count_event = 0
        self.last_cross_ts = 0.0
        self.min_cross_interval = 0.25
        self.last_x = None

    def get_experiment_type(self) -> str:
        return self.experiment_type

    def configure(self, config: dict):
        super().configure(config)
        
        # Update FPS if provided
        if self.config.get("preview_fps") is not None:
            try:
                self.preview_fps = int(self.config.get("preview_fps"))
            except Exception:
                pass

        # Update Color Ranges
        # Expected format: [min, max] for H, S, V
        try:
            h_range = self.config.get("h_range", [0, 50])
            s_range = self.config.get("s_range", [100, 255])
            v_range = self.config.get("v_range", [50, 255])
            
            self.lower_color = np.array([int(h_range[0]), int(s_range[0]), int(v_range[0])])
            self.upper_color = np.array([int(h_range[1]), int(s_range[1]), int(v_range[1])])
        except Exception:
            pass

        # Update other settings
        if "adaptive_color" in self.config:
            self.adaptive_color = bool(self.config["adaptive_color"])
        if "tracking_mode" in self.config:
            self.tracking_mode = str(self.config["tracking_mode"]).lower()
            # Map to internal tracker mode
            if self.tracking_mode in ("csrt", "roi", "tracker"):
                self.tracker_mode = "csrt"
        if "exclude_skin" in self.config:
            try:
                self.exclude_skin = bool(self.config["exclude_skin"])
            except Exception:
                pass
        if "midline_margin" in self.config:
            try:
                self.midline_margin = int(self.config["midline_margin"])
            except Exception:
                pass
        if "min_circularity" in self.config:
            try:
                self.min_circularity = float(self.config["min_circularity"])
            except Exception:
                pass
        if "aruco_id" in self.config:
            try:
                self.aruco_id = int(self.config["aruco_id"])
            except Exception:
                self.aruco_id = None
        if "aruco_dict" in self.config:
            self.aruco_dict_name = str(self.config["aruco_dict"])
        try:
            import cv2 as _cv2
            if hasattr(_cv2, "aruco"):
                adname = self.aruco_dict_name
                admap = {
                    "DICT_4X4_50": _cv2.aruco.DICT_4X4_50,
                    "DICT_5X5_100": _cv2.aruco.DICT_5X5_100,
                    "DICT_6X6_250": _cv2.aruco.DICT_6X6_250,
                    "DICT_7X7_1000": _cv2.aruco.DICT_7X7_1000,
                }
                code = admap.get(adname, _cv2.aruco.DICT_4X4_50)
                self._aruco_dict = _cv2.aruco.getPredefinedDictionary(code)
                self._aruco_params = _cv2.aruco.DetectorParameters_create()
        except Exception:
            self._aruco_dict = None
            self._aruco_params = None
        
        if "auto_hsv_margin" in self.config:
            try:
                m = self.config["auto_hsv_margin"]
                if isinstance(m, (list, tuple)) and len(m) == 3:
                    self._auto_hsv_margin = (int(m[0]), int(m[1]), int(m[2]))
            except Exception:
                pass
        
        if "tracker_bbox" in self.config:
            try:
                tb = self.config["tracker_bbox"]
                if isinstance(tb, (list, tuple)) and len(tb) == 4:
                    self.tracker_bbox = (int(tb[0]), int(tb[1]), int(tb[2]), int(tb[3]))
            except Exception:
                self.tracker_bbox = None
            
        if "reset_tracking" in config and config["reset_tracking"]:
            self._reset_tracking_state()
            try:
                self.config["reset_tracking"] = False
            except Exception:
                pass
            
        # Ensure camera is running for preview
        self._ensure_camera_running()

    def _reset_tracking_state(self):
        self.positions.clear()
        self.timestamps.clear()
        self.periods.clear()
        self.last_extreme = None
        self.last_extreme_time = None
        self.last_extreme_type = None
        self.extreme_points = []
        self.current_period = None
        self.kalman_initialized = False
        self.color_history.clear()
        self.start_time = None
        self._start_monotonic = None
        self.last_sign = None
        self.counting_started = False
        self.crossing_count = 0
        self.oscillation_count_event = 0
        self.last_cross_ts = 0.0
        self.last_x = None
        self.tracker = None
        self.tracker_mode = None
        self.tracker_bbox = None
        self.tracker_initialized = False
        self.tracker_last_ok_ts = 0.0
        # Don't reset tracking flag here, just data

    def _ensure_camera_running(self):
        if self.disabled:
            self.is_active = False
            return
        if self.is_active and self.cap and self.cap.isOpened() and self.worker and self.worker.is_alive():
            return

        # Start camera logic (extracted from start_experiment)
        try:
            self.loop = asyncio.get_event_loop()
        except Exception:
            self.loop = None
            
        cam_id = self.config.get("camera_id", 0)
        try:
            cam_id = int(cam_id)
        except Exception:
            cam_id = 0

        cap = None
        try:
            cap = cv2.VideoCapture(cam_id, cv2.CAP_DSHOW)
        except Exception:
            cap = cv2.VideoCapture(cam_id)
        if not cap or not cap.isOpened():
            for idx in range(0, 6):
                if idx == cam_id:
                    continue
                try:
                    try:
                        candidate = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                    except Exception:
                        candidate = cv2.VideoCapture(idx)
                    if candidate and candidate.isOpened():
                        cap = candidate
                        cam_id = idx
                        break
                    try:
                        candidate.release()
                    except Exception:
                        pass
                except Exception:
                    continue
        self.cap = cap
        if not self.cap or not self.cap.isOpened():
            try:
                mgr = ClientWebSocketManager.get_instance()
                sm = SessionManager.get_instance()
                user_id = sm.get_user_id_for_device(self.device_id)
                if mgr and user_id and self.loop:
                    msg = {
                        "type": "error",
                        "device_id": self.device_id,
                        "experiment_type": self.experiment_type,
                        "message": "Camera could not be opened",
                        "camera_id": cam_id
                    }
                    asyncio.run_coroutine_threadsafe(mgr.send_to_user(user_id, msg), self.loop)
            except Exception:
                pass
            self.is_active = False
            return

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
        
        self._stop_event.clear()
        self.is_active = True # Camera is active
        self.tracking = True # Auto-start tracking logic
        
        self.worker = threading.Thread(target=self._run_loop, daemon=True)
        self.worker.start()

    def start_experiment(self):
        super().start_experiment()
        self._ensure_camera_running()
        self.recording = True
        self._reset_tracking_state()
        self._send_event("experiment_started")

    def stop_experiment(self):
        self.recording = False
        self._send_event("experiment_stopped")
        # Do NOT close camera here to allow preview to continue

    def cleanup(self):
        """Fully stop the processor and release resources"""
        self.recording = False
        self._stop_event.set()
        if self.worker and self.worker.is_alive():
            self.worker.join(timeout=2.0)
        
        if self.cap and self.cap.isOpened():
            self.cap.release()
        self.cap = None
        self.is_active = False
        self.worker = None
        self.disabled = True

    async def process_data(self, raw_data: dict) -> Optional[dict]:
        return None

    def _update_adaptive_color(self, hsv_values):
        if not self.adaptive_color:
            return
            
        self.color_history.append(hsv_values)
        
        if len(self.color_history) >= 3:
            h_values = [c[0] for c in self.color_history]
            s_values = [c[1] for c in self.color_history]
            v_values = [c[2] for c in self.color_history]
            
            h_avg = np.mean(h_values)
            s_avg = np.mean(s_values)
            v_avg = np.mean(v_values)
            
            h_std = max(5, np.std(h_values))
            s_std = max(20, np.std(s_values))
            v_std = max(20, np.std(v_values))
            
            self.lower_color = np.array([max(0, h_avg - h_std), max(0, s_avg - s_std), max(0, v_avg - v_std)])
            self.upper_color = np.array([min(179, h_avg + h_std), min(255, s_avg + s_std), min(255, v_avg + v_std)])

    def _apply_kalman_filter(self, measurement):
        if not self.kalman_initialized:
            self.kalman.statePre = np.array([[measurement[0]], [measurement[1]], [0], [0]], np.float32)
            self.kalman.statePost = np.array([[measurement[0]], [measurement[1]], [0], [0]], np.float32)
            self.kalman_initialized = True
            return measurement
        
        prediction = self.kalman.predict()
        self.predicted_position = (int(prediction[0]), int(prediction[1]))
        
        measurement_matrix = np.array([[measurement[0]], [measurement[1]]], np.float32)
        corrected_state = self.kalman.correct(measurement_matrix)
        
        return (int(corrected_state[0]), int(corrected_state[1]))

    def _detect_extreme_points(self, position, timestamp):
        window_size = 15
        if len(self.positions) > window_size:
            recent_positions = list(self.positions)[-window_size:]
            recent_timestamps = list(self.timestamps)[-window_size:]
            
            mid_index = window_size // 2
            mid_position = recent_positions[mid_index]
            mid_timestamp = recent_timestamps[mid_index]
            
            left_positions = recent_positions[:mid_index]
            right_positions = recent_positions[mid_index+1:]
            
            is_peak = all(mid_position <= p for p in left_positions) and \
                      all(mid_position <= p for p in right_positions) and \
                      (any(mid_position < p for p in left_positions) or \
                       any(mid_position < p for p in right_positions))
            
            is_valley = all(mid_position >= p for p in left_positions) and \
                        all(mid_position >= p for p in right_positions) and \
                        (any(mid_position > p for p in left_positions) or \
                         any(mid_position > p for p in right_positions))
            
            if is_peak or is_valley:
                extreme_type = 'max' if is_peak else 'min'
                
                if self.last_extreme_type != extreme_type and self.last_extreme_time is not None:
                    period = (mid_timestamp - self.last_extreme_time) * 2
                    if 0.1 < period < 10:
                        self.periods.append(period)
                        if len(self.periods) >= 3:
                            self.current_period = np.median(self.periods)
                        else:
                            self.current_period = sum(self.periods) / len(self.periods)
                
                self.last_extreme = mid_position
                self.last_extreme_time = mid_timestamp
                self.last_extreme_type = extreme_type
                self.extreme_points.append({
                    'position': mid_position,
                    'timestamp': mid_timestamp,
                    'type': extreme_type
                })

    def _detect_ball(self, frame, hsv) -> Tuple[Optional[Tuple[int, int]], Optional[np.ndarray], Optional[np.ndarray]]:
        mask = cv2.inRange(hsv, self.lower_color, self.upper_color)
        if self.exclude_skin:
            ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
            lower_skin = np.array([0, 133, 77], dtype=np.uint8)
            upper_skin = np.array([255, 173, 127], dtype=np.uint8)
            skin = cv2.inRange(ycrcb, lower_skin, upper_skin)
            inv_skin = cv2.bitwise_not(skin)
            mask = cv2.bitwise_and(mask, mask, mask=inv_skin)
        mask = cv2.GaussianBlur(mask, (5, 5), 0)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        best_center = None
        best_score = 0
        best_contour = None
        best_hsv = None
        
        min_blob_size = float(self.config.get("min_blob_size") or self.config.get("min_blob_area") or 100)
        roi_radius = float(self.config.get("roi_radius") or 120)
        
        if contours:
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < min_blob_size:
                    continue
                
                perimeter = cv2.arcLength(contour, True)
                circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0
                if circularity < float(self.min_circularity):
                    continue
                
                M = cv2.moments(contour)
                if M["m00"] > 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    center = (cx, cy)
                    
                    if self.predicted_position:
                        dx = center[0] - self.predicted_position[0]
                        dy = center[1] - self.predicted_position[1]
                        if dx * dx + dy * dy > roi_radius * roi_radius:
                            continue
                    
                    score = area * circularity
                    if self.predicted_position:
                        dist = np.sqrt((center[0] - self.predicted_position[0])**2 + 
                                       (center[1] - self.predicted_position[1])**2)
                        score += 1000 / (1 + dist)
                    
                    if score > best_score:
                        best_score = score
                        best_center = center
                        best_contour = contour
                        if cx < frame.shape[1] and cy < frame.shape[0]:
                            best_hsv = hsv[cy, cx]
        
        if best_center is None:
            circles = cv2.HoughCircles(mask, cv2.HOUGH_GRADIENT, 1.2, 20, param1=100, param2=18, minRadius=4, maxRadius=120)
            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")
                circle_best_score = -1.0
                chosen = None
                for x, y, r in circles:
                    if x < 0 or y < 0 or x >= frame.shape[1] or y >= frame.shape[0]:
                        continue
                    if self.predicted_position:
                        dx = x - self.predicted_position[0]
                        dy = y - self.predicted_position[1]
                        if dx * dx + dy * dy > roi_radius * roi_radius:
                            continue
                        dist = np.sqrt(dx * dx + dy * dy)
                    else:
                        dist = 0.0
                    score = float(r) + (1000.0 / (1.0 + dist))
                    if score > circle_best_score:
                        circle_best_score = score
                        chosen = (x, y, r)
                if chosen is not None:
                    bx, by, br = chosen
                    best_center = (int(bx), int(by))
                    best_contour = None
                    best_hsv = hsv[int(by), int(bx)] if 0 <= by < hsv.shape[0] and 0 <= bx < hsv.shape[1] else None
                            
        return best_center, best_contour, best_hsv
    
    def _detect_aruco(self, frame, hsv) -> Tuple[Optional[Tuple[int, int]], Optional[np.ndarray], Optional[np.ndarray]]:
        try:
            if self._aruco_dict is None or self._aruco_params is None:
                return None, None, None
            corners, ids, _ = cv2.aruco.detectMarkers(frame, self._aruco_dict, parameters=self._aruco_params)
            if ids is None or len(ids) == 0:
                return None, None, None
            chosen_idx = None
            if self.aruco_id is not None:
                for i in range(len(ids)):
                    if int(ids[i][0]) == int(self.aruco_id):
                        chosen_idx = i
                        break
            if chosen_idx is None:
                best_area = -1.0
                for i in range(len(corners)):
                    c = corners[i][0]
                    a = cv2.contourArea(c.astype(np.float32))
                    if a > best_area:
                        best_area = a
                        chosen_idx = i
            c = corners[chosen_idx][0]
            mx = int(np.mean(c[:, 0]))
            my = int(np.mean(c[:, 1]))
            if mx < 0 or my < 0 or mx >= frame.shape[1] or my >= frame.shape[0]:
                return None, None, None
            hsv_val = hsv[my, mx]
            return (mx, my), None, hsv_val
        except Exception:
            return None, None, None
    
    def _auto_detect_and_calibrate(self, frame, hsv) -> Tuple[Optional[Tuple[int, int]], Optional[np.ndarray], Optional[np.ndarray]]:
        fg = self._bg_subtractor.apply(frame)
        fg = cv2.GaussianBlur(fg, (5, 5), 0)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_score = -1.0
        for c in contours:
            area = cv2.contourArea(c)
            if area < 80:
                continue
            peri = cv2.arcLength(c, True)
            circ = 4 * np.pi * area / (peri * peri) if peri > 0 else 0
            if circ < 0.5:
                continue
            M = cv2.moments(c)
            if M["m00"] <= 0:
                continue
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            score = area * circ
            if score > best_score:
                best_score = score
                best = (cx, cy, c)
        if best is None:
            return None, None, None
        cx, cy, contour = best
        y0 = max(0, cy - 8)
        y1 = min(hsv.shape[0], cy + 8)
        x0 = max(0, cx - 8)
        x1 = min(hsv.shape[1], cx + 8)
        roi = hsv[y0:y1, x0:x1]
        if roi.size == 0:
            return None, None, None
        h_mean, s_mean, v_mean = np.mean(roi.reshape(-1, 3), axis=0)
        hm, sm, vm = self._auto_hsv_margin
        self.lower_color = np.array([max(0, h_mean - hm), max(0, s_mean - sm), max(0, v_mean - vm)])
        self.upper_color = np.array([min(179, h_mean + hm), min(255, s_mean + sm), min(255, v_mean + vm)])
        self._auto_initialized = True
        self._auto_last_init_ts = time.time()
        return (cx, cy), contour, hsv[cy, cx]
    
    def _init_tracker(self, frame, bbox) -> bool:
        try:
            t = None
            if hasattr(cv2, "legacy"):
                if hasattr(cv2.legacy, "TrackerCSRT_create"):
                    t = cv2.legacy.TrackerCSRT_create()
                elif hasattr(cv2.legacy, "TrackerKCF_create"):
                    t = cv2.legacy.TrackerKCF_create()
                elif hasattr(cv2.legacy, "TrackerMOSSE_create"):
                    t = cv2.legacy.TrackerMOSSE_create()
            else:
                if hasattr(cv2, "TrackerCSRT_create"):
                    t = cv2.TrackerCSRT_create()
                elif hasattr(cv2, "TrackerKCF_create"):
                    t = cv2.TrackerKCF_create()
            if t is None:
                return False
            ok = t.init(frame, bbox)
            if not ok:
                return False
            self.tracker = t
            self.tracker_initialized = True
            self.tracker_last_ok_ts = time.time()
            return True
        except Exception:
            return False

    def get_jpeg_frame(self):
        # Lazy start if requested
        self._ensure_camera_running()
        
        frame_to_encode = None
        with self.lock:
            if self.processed_frame is not None:
                frame_to_encode = self.processed_frame

        if frame_to_encode is None:
            # Return a blank frame if nothing is available yet
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            _, jpeg = cv2.imencode('.jpg', blank)
        else:
            _, jpeg = cv2.imencode('.jpg', frame_to_encode, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            
        return jpeg.tobytes()

    def _run_loop(self):
        while not self._stop_event.is_set() and self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret:
                time.sleep(0.02)
                continue
            
            # Reduce processing load by resizing if needed (optional, keeping original size for now)
            # frame = cv2.resize(frame, (640, 480)) 

            output_frame = frame.copy()
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            mid_x_vis = int(frame.shape[1] // 2)
            cv2.line(output_frame, (mid_x_vis, 0), (mid_x_vis, frame.shape[0]), (128, 64, 255), 1)
            
            if self.tracker_mode == "csrt":
                center = None
                contour = None
                hsv_val = None
                if self.tracker_initialized and self.tracker is not None:
                    try:
                        ok, bbox = self.tracker.update(frame)
                    except Exception:
                        ok, bbox = False, None
                    if ok and bbox:
                        x, y, w, h = map(int, bbox)
                        cx = x + w // 2
                        cy = y + h // 2
                        center = (cx, cy)
                        self.tracker_last_ok_ts = time.time()
                        if 0 <= cy < hsv.shape[0] and 0 <= cx < hsv.shape[1]:
                            hsv_val = hsv[cy, cx]
                        cv2.rectangle(output_frame, (x, y), (x + w, y + h), (0, 200, 255), 2)
                    else:
                        if (time.time() - self.tracker_last_ok_ts) > 1.5:
                            self.tracker_initialized = False
                            self.tracker = None
                if center is None:
                    if self.tracker_bbox:
                        self._init_tracker(frame, self.tracker_bbox)
                    else:
                        bc, bt, hv = self._detect_ball(frame, hsv)
                        if bc is None and (self.tracking_mode == "auto"):
                            bc, bt, hv = self._auto_detect_and_calibrate(frame, hsv)
                        if bc is not None:
                            x0 = max(0, bc[0] - 25)
                            y0 = max(0, bc[1] - 25)
                            x1 = min(frame.shape[1] - 1, bc[0] + 25)
                            y1 = min(frame.shape[0] - 1, bc[1] + 25)
                            bbox = (x0, y0, x1 - x0, y1 - y0)
                            if self._init_tracker(frame, bbox):
                                center = bc
                                hsv_val = hv
                            else:
                                center, contour, hsv_val = bc, bt, hv
            elif self.tracking_mode == "aruco":
                center, contour, hsv_val = self._detect_aruco(frame, hsv)
                if center is None:
                    center, contour, hsv_val = self._detect_ball(frame, hsv)
            elif self.tracking_mode == "auto":
                if not self._auto_initialized or (time.time() - self._auto_last_init_ts) > 5.0:
                    ac_center, ac_contour, ac_hsv = self._auto_detect_and_calibrate(frame, hsv)
                    if ac_center is not None:
                        center, contour, hsv_val = ac_center, ac_contour, ac_hsv
                    else:
                        center, contour, hsv_val = self._detect_ball(frame, hsv)
                else:
                    center, contour, hsv_val = self._detect_ball(frame, hsv)
            else:
                center, contour, hsv_val = self._detect_ball(frame, hsv)
            
            detection_confidence = 0.0
            
            if center:
                detection_confidence = 1.0 # High confidence if found
                
                if hsv_val is not None:
                    self._update_adaptive_color(hsv_val)
                    
                filtered_center = self._apply_kalman_filter(center)
                
                if contour is not None:
                    cv2.drawContours(output_frame, [contour], 0, (0, 255, 0), 2)
                
                cv2.circle(output_frame, filtered_center, 5, (255, 0, 0), -1)
                
                if self.predicted_position:
                    cv2.circle(output_frame, self.predicted_position, 3, (0, 0, 255), -1)
                
                if self.tracking:
                    current_time = time.time()
                    if self._start_monotonic is None:
                        self._start_monotonic = current_time
                    
                    relative_time = current_time - self._start_monotonic
                    
                    self.positions.append(filtered_center[1])
                    self.timestamps.append(relative_time)
                    
                    self._detect_extreme_points(filtered_center[1], relative_time)
                    self._draw_motion_trail(output_frame)
                    
                    if self.recording:
                        mid_x = int(frame.shape[1] // 2)
                        prev_x = self.last_x
                        curr_x = filtered_center[0]
                        self.last_x = curr_x
                        crossed = False
                        if prev_x is not None:
                            prev_side = prev_x - mid_x
                            curr_side = curr_x - mid_x
                            if (prev_side * curr_side) < 0:
                                if (current_time - self.last_cross_ts) >= self.min_cross_interval:
                                    crossed = True
                                    self.last_cross_ts = current_time
                        sign = -1 if (curr_x - mid_x) < 0 else (1 if (curr_x - mid_x) > 0 else 0)
                        self.last_sign = sign if sign != 0 else self.last_sign
                        if crossed:
                            if not self.counting_started:
                                self.counting_started = True
                                self.crossing_count = 0
                            else:
                                self.crossing_count += 1
                                if (self.crossing_count % 2) == 0:
                                    self.oscillation_count_event += 1
                    
                    cv2.putText(output_frame, f"Cross:{int(self.crossing_count)} Osc:{int(self.oscillation_count_event)}",
                                (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 200, 255), 2)

            now = time.time()
            if self.data_fps > 0 and self.recording:
                data_interval = 1.0 / float(self.data_fps)
                if now - self._last_data_ts >= data_interval:
                    self._last_data_ts = now
                    data = {
                        "time_elapsed": self.get_elapsed_time(),
                        "oscillation_count": int(self.oscillation_count_event),
                        "midline_crossings": int(self.crossing_count),
                        "counting_started": bool(self.counting_started),
                        "period": float(self.current_period) if self.current_period else 0.0,
                        "detection_confidence": detection_confidence,
                        "center_x": int(center[0]) if center else None,
                        "center_y": int(center[1]) if center else None,
                        "frame_width": frame.shape[1],
                        "frame_height": frame.shape[0]
                    }
                    self._send_processed(data)
            
            # Store frame for MJPEG streaming and skip WebSocket preview
            with self.lock:
                self.processed_frame = output_frame
            
            # Legacy WebSocket preview (disabled for performance)
            # if self.preview_fps > 0:
            #     interval = 1.0 / float(self.preview_fps)
            #     if now - self._last_preview_ts >= interval:
            #         self._last_preview_ts = now
            #         # Draw text info
            #         cv2.putText(output_frame, f"HSV: {self.lower_color}-{self.upper_color}", 
            #                    (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
            #         period_text = f"Period: {self.current_period:.3f} s" if self.current_period else "Period: - s"
            #         cv2.putText(output_frame, period_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            #         
            #         preview = self._encode_frame(output_frame)
            #         self._send_preview(preview)
            
            # Match reference code: Sleep to maintain ~30FPS and reduce CPU usage
            time.sleep(0.01)

    def _draw_motion_trail(self, frame):
        if len(self.positions) < 2:
            return
            
        points = []
        for i in range(min(len(self.positions), 50)):
            idx = -i - 1
            if idx < -len(self.positions):
                break
            # We only track Y, so X is centered for the trail visualization (like user's code)
            # OR we could track X too if we changed the deque to store (x,y)
            # User's code: x = int(frame.shape[1] // 2)
            y = self.positions[idx]
            x = int(frame.shape[1] // 2) 
            points.append((x, int(y)))
            
        for i in range(1, len(points)):
            ratio = i / len(points)
            b = int(255 * ratio)
            r = int(255 * (1 - ratio))
            color = (b, 0, r)
            cv2.line(frame, points[i-1], points[i], color, 2)
            
        for point in self.extreme_points[-10:]:
             color = (0, 0, 255) if point['type'] == 'max' else (255, 0, 0)
             x = int(frame.shape[1] // 2)
             y = int(point['position'])
             cv2.circle(frame, (x, y), 4, color, -1)

    def _encode_frame(self, frame):
        ok, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        if not ok:
            return None
        b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"

    def _send_event(self, evt_type: str):
        try:
            mgr = ClientWebSocketManager.get_instance()
            sm = SessionManager.get_instance()
            user_id = sm.get_user_id_for_device(self.device_id)
            if mgr and user_id:
                msg = {"type": evt_type, "device_id": self.device_id, "experiment_type": self.experiment_type}
                if self.loop:
                    asyncio.run_coroutine_threadsafe(mgr.send_to_user(user_id, msg), self.loop)
        except Exception:
            pass

    def _send_processed(self, data: dict):
        try:
            mgr = ClientWebSocketManager.get_instance()
            sm = SessionManager.get_instance()
            user_id = sm.get_user_id_for_device(self.device_id)
            if mgr and user_id:
                msg = {
                    "type": "processed_data",
                    "device_id": self.device_id,
                    "experiment_type": self.experiment_type,
                    "data": data
                }
                if self.loop:
                    asyncio.run_coroutine_threadsafe(mgr.send_to_user(user_id, msg), self.loop)
        except Exception:
            pass

    def _send_preview(self, data_url: Optional[str]):
        if not data_url:
            return
        try:
            mgr = ClientWebSocketManager.get_instance()
            sm = SessionManager.get_instance()
            user_id = sm.get_user_id_for_device(self.device_id)
            if mgr and user_id:
                msg = {
                    "type": "video_preview",
                    "device_id": self.device_id,
                    "experiment_type": self.experiment_type,
                    "frame": data_url
                }
                if self.loop:
                    asyncio.run_coroutine_threadsafe(mgr.send_to_user(user_id, msg), self.loop)
        except Exception:
            pass
