import cv2
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import time
from collections import deque
from flask import Flask, Response, render_template, request, jsonify
import threading
import json
import os
from scipy.signal import savgol_filter, find_peaks
from sklearn.cluster import KMeans

class PendulumTracker:
    def __init__(self):
        # Video capture
        self.cap = None
        
        # HSV color range for tracking
        self.lower_color = np.array([0, 100, 50])
        self.upper_color = np.array([50, 255, 255])
        
        # Tracking data
        self.positions = deque(maxlen=300)  # y-positions
        self.timestamps = deque(maxlen=300)  # corresponding timestamps
        self.periods = deque(maxlen=10)     # calculated periods
        
        # Tracking state
        self.tracking = False
        self.last_extreme = None
        self.last_extreme_time = None
        self.last_extreme_type = None  # 'min' or 'max'
        
        # Min blob size for tracking
        self.min_blob_size = 100
        
        # For web display
        self.processed_frame = None
        self.lock = threading.Lock()
        self.start_time = None
        
        # For periodic calculations
        self.extreme_points = []
        self.current_period = None
        
        # Kalman filter for smooth tracking
        self.kalman = cv2.KalmanFilter(4, 2)
        self.kalman.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
        self.kalman.transitionMatrix = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)
        self.kalman.processNoiseCov = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32) * 0.03
        self.kalman_initialized = False
        
        # For adaptive color tracking
        self.adaptive_color = False
        self.color_history = deque(maxlen=5)
        
        # For trajectory prediction
        self.predicted_position = None
        
        # Initial ROI (full frame)
        self.roi = None
    
    def start_camera(self):
        """Start the camera capture."""
        self.cap = cv2.VideoCapture(0)  # Use default camera (change index if needed)
        if not self.cap.isOpened():
            print("Error: Could not open camera.")
            return False
        
        # Set camera properties for better performance
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)  # Disable autofocus
        
        # Initialize ROI to full frame
        self.roi = (0, 0, 640, 480)
        
        return True
    
    def stop_camera(self):
        """Stop the camera capture."""
        if self.cap and self.cap.isOpened():
            self.cap.release()
            self.cap = None
    
    def update_color_range(self, hue_min, hue_max, sat_min, sat_max, val_min, val_max):
        """Update the HSV color range for tracking."""
        self.lower_color = np.array([hue_min, sat_min, val_min])
        self.upper_color = np.array([hue_max, sat_max, val_max])
    
    def update_min_blob_size(self, size):
        """Update the minimum blob size for tracking."""
        self.min_blob_size = size
    
    def reset_tracking(self):
        """Reset all tracking data."""
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
    
    def update_adaptive_color(self, hsv_values):
        """Update color range based on detected object."""
        if not self.adaptive_color:
            return
            
        self.color_history.append(hsv_values)
        
        if len(self.color_history) >= 3:
            # Calculate average HSV values
            h_values = [color[0] for color in self.color_history]
            s_values = [color[1] for color in self.color_history]
            v_values = [color[2] for color in self.color_history]
            
            h_avg = np.mean(h_values)
            s_avg = np.mean(s_values)
            v_avg = np.mean(v_values)
            
            # Calculate standard deviation
            h_std = max(5, np.std(h_values))
            s_std = max(20, np.std(s_values))
            v_std = max(20, np.std(v_values))
            
            # Update color ranges with adaptive margins
            self.lower_color = np.array([max(0, h_avg - h_std), 
                                         max(0, s_avg - s_std), 
                                         max(0, v_avg - v_std)])
            self.upper_color = np.array([min(179, h_avg + h_std), 
                                         min(255, s_avg + s_std), 
                                         min(255, v_avg + v_std)])
    
    def detect_extreme_points(self, position, timestamp):
        """Improved period calculation with Savitzky-Golay filter"""
        if len(self.positions) < 20:
            return
        
        # Apply smoothing filter
        smoothed = savgol_filter(list(self.positions), 15, 3)
        
        # Find peaks/valleys in smoothed data
        peaks, _ = find_peaks(smoothed, distance=15)
        valleys, _ = find_peaks(-smoothed, distance=15)
        
        all_extremes = sorted(zip(peaks, ['max']*len(peaks)) + 
                             zip(valleys, ['min']*len(valleys)),
                             key=lambda x: x[0])
        
        # Process extremes for period calculation
        for idx, ext_type in all_extremes[-3:]:  # Process last 3 extremes
            ext_time = self.timestamps[idx]
            
            if self.last_extreme_type and self.last_extreme_type != ext_type:
                period = 2 * (ext_time - self.last_extreme_time)
                
                if 0.1 < period < 10:  # Valid period range
                    self.periods.append(period)
                    self.current_period = np.median(self.periods) if len(self.periods) > 2 else period
            
            self.last_extreme = smoothed[idx]
            self.last_extreme_time = ext_time
            self.last_extreme_type = ext_type
            self.extreme_points.append({
                'position': int(smoothed[idx]),
                'timestamp': ext_time,
                'type': ext_type
            })

    def apply_kalman_filter(self, measurement):
        """Apply Kalman filter for smoothing the tracking."""
        if not self.kalman_initialized:
            self.kalman.statePre = np.array([[measurement[0]], [measurement[1]], [0], [0]], np.float32)
            self.kalman.statePost = np.array([[measurement[0]], [measurement[1]], [0], [0]], np.float32)
            self.kalman_initialized = True
            return measurement
        
        # Prediction
        prediction = self.kalman.predict()
        self.predicted_position = (int(prediction[0]), int(prediction[1]))
        
        # Correction
        measurement_matrix = np.array([[measurement[0]], [measurement[1]]], np.float32)
        corrected_state = self.kalman.correct(measurement_matrix)
        
        return (int(corrected_state[0]), int(corrected_state[1]))
    
    def detect_ball(self, frame, hsv):
        """Enhanced ball detection with multiple methods."""
        # Apply ROI
        x1, y1, x2, y2 = self.roi
        roi_frame = frame[y1:y2, x1:x2]
        roi_hsv = hsv[y1:y2, x1:x2]
        
        # Method 1: Color-based detection
        mask = cv2.inRange(roi_hsv, self.lower_color, self.upper_color)
        
        # Apply morphological operations to clean up the mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        # Find contours in the mask
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Find the largest contour matching our criteria
        best_center = None
        best_score = 0
        best_contour = None
        best_hsv = None
        
        if contours:
            for contour in contours:
                area = cv2.contourArea(contour)
                
                if area < self.min_blob_size:
                    continue
                
                # Calculate circularity to ensure it's roughly a circle
                perimeter = cv2.arcLength(contour, True)
                circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0
                
                # Get the center using moments
                M = cv2.moments(contour)
                if M["m00"] > 0:
                    cx = int(M["m10"] / M["m00"]) + x1
                    cy = int(M["m01"] / M["m00"]) + y1
                    center = (cx, cy)
                    
                    # Calculate a score based on area and circularity
                    score = area * circularity
                    
                    # If we have previous predictions, consider proximity
                    if self.predicted_position:
                        distance = np.sqrt((center[0] - self.predicted_position[0])**2 + 
                                           (center[1] - self.predicted_position[1])**2)
                        proximity_score = 1000 / (1 + distance)  # Higher for closer matches
                        score += proximity_score
                    
                    # Keep the best match
                    if score > best_score:
                        best_score = score
                        best_center = center
                        best_contour = contour
                        
                        # Sample HSV color at the center for adaptive tracking
                        if cx < frame.shape[1] and cy < frame.shape[0]:
                            best_hsv = hsv[cy, cx]
        
        # Method 2: Try circle detection if no good contour was found
        if best_center is None and self.predicted_position:
            # Try to find circles near the predicted position
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (9, 9), 2)
            
            # Look near the predicted position
            search_radius = 100
            x1 = max(0, self.predicted_position[0] - search_radius)
            y1 = max(0, self.predicted_position[1] - search_radius)
            x2 = min(frame.shape[1], self.predicted_position[0] + search_radius)
            y2 = min(frame.shape[0], self.predicted_position[1] + search_radius)
            
            if x2 > x1 and y2 > y1:
                roi = blurred[y1:y2, x1:x2]
                
                # Detect circles in the ROI
                circles = cv2.HoughCircles(roi, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                                        param1=50, param2=30, minRadius=5, maxRadius=60)
                
                if circles is not None:
                    circles = np.uint16(np.around(circles))
                    for i in circles[0, :]:
                        # Adjust coordinates back to the original frame
                        cx = x1 + i[0]
                        cy = y1 + i[1]
                        
                        # Check if the circle's color matches our target color range
                        if cx < frame.shape[1] and cy < frame.shape[0]:
                            pixel_hsv = hsv[cy, cx]
                            if (self.lower_color[0] <= pixel_hsv[0] <= self.upper_color[0] and
                                self.lower_color[1] <= pixel_hsv[1] <= self.upper_color[1] and
                                self.lower_color[2] <= pixel_hsv[2] <= self.upper_color[2]):
                                best_center = (cx, cy)
                                best_hsv = pixel_hsv
                                break
        
        # Update ROI for next frame
        if best_center:
            self.roi = (
                max(0, best_center[0] - 100),
                max(0, best_center[1] - 100),
                min(frame.shape[1], best_center[0] + 100),
                min(frame.shape[0], best_center[1] + 100)
            )
        else:
            # Gradually expand ROI if no detection
            self.roi = (
                max(0, self.roi[0] - 20),
                max(0, self.roi[1] - 20),
                min(frame.shape[1], self.roi[2] + 20),
                min(frame.shape[0], self.roi[3] + 20)
            )
        
        return best_center, best_contour, best_hsv
    
    def auto_calibrate(self, frame):
        """Automatically find pendulum color characteristics"""
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Focus on center region
        h, w = frame.shape[:2]
        roi = frame[h//4:3*h//4, w//4:3*w//4]
        
        # Find dominant colors
        pixels = roi.reshape(-1, 3)
        kmeans = KMeans(n_clusters=3)
        kmeans.fit(pixels)
        
        # Get brightest cluster (likely the pendulum)
        brightest_idx = np.argmax(kmeans.cluster_centers_.sum(axis=1))
        target_color = kmeans.cluster_centers_[brightest_idx]
        
        # Set new color range
        self.lower_color = np.array([max(0, target_color[0]-15),
                                    max(0, target_color[1]-40),
                                    max(0, target_color[2]-40)])
        self.upper_color = np.array([min(179, target_color[0]+15),
                                    min(255, target_color[1]+40),
                                    min(255, target_color[2]+40)])
    
    def process_frame(self):
        """Optimized frame processing with FPS control"""
        if not self.cap or not self.cap.isOpened():
            return None, None
        
        start_time = time.perf_counter()
        
        ret, frame = self.cap.read()
        if not ret:
            return None, None
        
        # Downscale for processing
        processing_frame = cv2.resize(frame, (320, 240))
        hsv = cv2.cvtColor(processing_frame, cv2.COLOR_BGR2HSV)
        
        # Detect the pendulum ball
        ball_center, contour, hsv_value = self.detect_ball(processing_frame, hsv)
        
        # Create output frame (original resolution)
        output_frame = frame.copy()
        
        # Scale ball_center back to original resolution
        if ball_center:
            ball_center = (int(ball_center[0] * frame.shape[1] / 320), 
                          int(ball_center[1] * frame.shape[0] / 240))
            
            # Update adaptive color if enabled
            if hsv_value is not None:
                self.update_adaptive_color(hsv_value)
            
            # Apply Kalman filter for smooth tracking
            filtered_center = self.apply_kalman_filter(ball_center)
            
            # Draw contour if available (scale contour to original resolution)
            if contour is not None:
                contour = contour * np.array([frame.shape[1]/320, frame.shape[0]/240])
                contour = contour.astype(np.int32)
                cv2.drawContours(output_frame, [contour], 0, (0, 255, 0), 2)
            
            # Draw the center point
            cv2.circle(output_frame, filtered_center, 5, (255, 0, 0), -1)
            
            # Draw predicted position if available
            if self.predicted_position:
                self.predicted_position = (int(self.predicted_position[0] * frame.shape[1] / 320), 
                                         int(self.predicted_position[1] * frame.shape[0] / 240))
                cv2.circle(output_frame, self.predicted_position, 3, (0, 0, 255), -1)
            
            # Track position if tracking is enabled
            if self.tracking:
                current_time = time.time()
                if self.start_time is None:
                    self.start_time = current_time
                
                relative_time = current_time - self.start_time
                
                # Use the y-coordinate for vertical tracking
                self.positions.append(filtered_center[1])
                self.timestamps.append(relative_time)
                
                # Detect extreme points for period calculation
                self.detect_extreme_points(filtered_center[1], relative_time)
                
                # Draw the motion trail
                self.draw_motion_trail(output_frame)
        
        # Draw detection parameters on frame
        cv2.putText(output_frame, f"HSV Range: [{self.lower_color[0]}-{self.upper_color[0]}," +
                   f"{self.lower_color[1]}-{self.upper_color[1]},{self.lower_color[2]}-{self.upper_color[2]}]", 
                   (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
        
        # Add FPS
        fps = 1.0 / (time.perf_counter() - start_time)
        cv2.putText(output_frame, f"FPS: {fps:.1f}", (10, 90), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 0), 1)
        
        # Add text about the period
        period_text = f"Period: {self.current_period:.3f} s" if self.current_period else "Period: - seconds"
        cv2.putText(output_frame, period_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        
        # Store processed frame for web display
        with self.lock:
            self.processed_frame = output_frame
        
        return frame, output_frame
    
    def draw_motion_trail(self, frame):
        """Draw a motion trail showing the pendulum's recent movement."""
        if len(self.positions) < 2:
            return
        
        # Draw the actual trajectory
        points = []
        for i in range(min(len(self.positions), 50)):  # Last 50 positions
            idx = -i - 1
            if idx < -len(self.positions):
                break
                
            t = self.timestamps[idx]
            y = self.positions[idx]
            x = int(frame.shape[1] // 2)  # Center horizontally
            points.append((x, int(y)))
        
        # Draw connecting lines with gradient color
        for i in range(1, len(points)):
            # Gradual color change from red to blue
            ratio = i / len(points)
            b = int(255 * ratio)
            r = int(255 * (1 - ratio))
            color = (b, 0, r)
            cv2.line(frame, points[i-1], points[i], color, 2)
        
        # Draw extreme points
        for point in self.extreme_points[-10:]:  # Show last 10 extreme points
            if point['type'] == 'max':
                color = (0, 0, 255)  # Red for maxima
            else:
                color = (255, 0, 0)  # Blue for minima
            
            # Find the x-coordinate based on timestamp
            x = int(frame.shape[1] // 2)
            y = int(point['position'])
            cv2.circle(frame, (x, y), 4, color, -1)
    
    def get_tracking_data(self):
        """Return the current tracking data as a JSON-serializable dict."""
        data = {
            'positions': list(self.positions),
            'timestamps': list(self.timestamps),
            'period': self.current_period,
            'extremePoints': [{'position': p['position'], 
                              'timestamp': p['timestamp'], 
                              'type': p['type']} for p in self.extreme_points[-10:]]
        }
        return data
    
    def get_jpeg_frame(self):
        """Get the current processed frame as JPEG bytes."""
        with self.lock:
            if self.processed_frame is None:
                # Return a blank frame if none is available
                blank = np.zeros((480, 640, 3), dtype=np.uint8)
                _, jpeg = cv2.imencode('.jpg', blank)
            else:
                _, jpeg = cv2.imencode('.jpg', self.processed_frame)
        return jpeg.tobytes()

# Initialize Flask app
app = Flask(__name__, static_folder='static', template_folder='templates')
tracker = PendulumTracker()

# Ensure the static and templates directories exist
os.makedirs('static', exist_ok=True)
os.makedirs('templates', exist_ok=True)

# Route for the home page
@app.route('/')
def index():
    return render_template('index.html')

# Route to get the video feed
@app.route('/video_feed')
def video_feed():
    def generate():
        while True:
            frame = tracker.get_jpeg_frame()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

# Route to start the camera
@app.route('/api/start_camera', methods=['POST'])
def start_camera():
    success = tracker.start_camera()
    if success:
        # Start the background thread for processing frames
        threading.Thread(target=process_frames_thread, daemon=True).start()
        return jsonify({'status': 'success', 'message': 'Camera started'})
    else:
        return jsonify({'status': 'error', 'message': 'Could not start camera'})

# Route to stop the camera
@app.route('/api/stop_camera', methods=['POST'])
def stop_camera():
    tracker.stop_camera()
    return jsonify({'status': 'success', 'message': 'Camera stopped'})

# Route to start tracking
@app.route('/api/start_tracking', methods=['POST'])
def start_tracking():
    tracker.tracking = True
    tracker.reset_tracking()
    return jsonify({'status': 'success', 'message': 'Tracking started'})

# Route to stop tracking
@app.route('/api/stop_tracking', methods=['POST'])
def stop_tracking():
    tracker.tracking = False
    return jsonify({'status': 'success', 'message': 'Tracking stopped'})

# Route to reset tracking data
@app.route('/api/reset_tracking', methods=['POST'])
def reset_tracking():
    tracker.reset_tracking()
    return jsonify({'status': 'success', 'message': 'Tracking data reset'})

# Route to toggle adaptive color tracking
@app.route('/api/toggle_adaptive_color', methods=['POST'])
def toggle_adaptive_color():
    data = request.json
    tracker.adaptive_color = data.get('enabled', False)
    return jsonify({'status': 'success', 'message': f'Adaptive color tracking: {"enabled" if tracker.adaptive_color else "disabled"}'})

# Route to update color settings
@app.route('/api/update_color', methods=['POST'])
def update_color():
    data = request.json
    tracker.update_color_range(
        int(data.get('hueMin', 0)),
        int(data.get('hueMax', 50)),
        int(data.get('satMin', 100)),
        int(data.get('satMax', 255)),
        int(data.get('valMin', 50)),
        int(data.get('valMax', 255))
    )
    tracker.update_min_blob_size(int(data.get('minSize', 10)))
    return jsonify({'status': 'success', 'message': 'Color settings updated'})

# Route to get the current tracking data
@app.route('/api/tracking_data')
def get_tracking_data():
    return jsonify(tracker.get_tracking_data())

# Route to export tracking data
@app.route('/api/export_data')
def export_data():
    data = tracker.get_tracking_data()
    csv = "Time,Position\n"
    for t, p in zip(data['timestamps'], data['positions']):
        csv += f"{t:.3f},{p}\n"
    
    return Response(
        csv,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=pendulum_data.csv"}
    )

def process_frames_thread():
    """Background thread to continuously process frames."""
    while tracker.cap and tracker.cap.isOpened():
        tracker.process_frame()
        time.sleep(0.03)  # ~30fps

if __name__ == '__main__':
    print("Starting Pendulum Tracker Server...")
    print("Open http://127.0.0.1:5000 in your web browser")
    app.run(debug=False, threaded=True)