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
    
    def start_camera(self):
        """Start the camera capture."""
        self.cap = cv2.VideoCapture(0)  # Use default camera (change index if needed)
        if not self.cap.isOpened():
            print("Error: Could not open camera.")
            return False
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
    
    def detect_extreme_points(self, position, timestamp):
        """Detect extreme points (max and min) for period calculation."""
        window_size = 10  # Number of points to check for extremes
        
        if len(self.positions) > window_size:
            # Get a window of recent positions
            recent_positions = list(self.positions)[-window_size:]
            
            # Check if the middle point is an extreme (peak or valley)
            mid_index = window_size // 2
            mid_position = recent_positions[mid_index]
            mid_timestamp = list(self.timestamps)[-window_size + mid_index]
            
            # Check if it's a peak (lower than all points around it)
            is_peak = True
            for i in range(window_size):
                if i != mid_index and recent_positions[i] < mid_position:
                    is_peak = False
                    break
            
            # Check if it's a valley (higher than all points around it)
            is_valley = True
            for i in range(window_size):
                if i != mid_index and recent_positions[i] > mid_position:
                    is_valley = False
                    break
            
            # If we found an extreme point
            if is_peak or is_valley:
                extreme_type = 'max' if is_peak else 'min'
                
                # Only process if it's a different type than the last extreme
                if self.last_extreme_type != extreme_type and self.last_extreme_time is not None:
                    # Calculate time since last extreme of opposite type
                    period = (mid_timestamp - self.last_extreme_time) * 2
                    
                    # Only add reasonable periods (filter out noise)
                    if 0.1 < period < 10:
                        self.periods.append(period)
                        self.current_period = sum(self.periods) / len(self.periods)
                
                # Update last extreme
                self.last_extreme = mid_position
                self.last_extreme_time = mid_timestamp
                self.last_extreme_type = extreme_type
                self.extreme_points.append({
                    'position': mid_position,
                    'timestamp': mid_timestamp,
                    'type': extreme_type
                })
    
    def process_frame(self):
        """Process a single frame from the camera."""
        if not self.cap or not self.cap.isOpened():
            return None, None
        
        ret, frame = self.cap.read()
        if not ret:
            return None, None
        
        # Create a copy for drawing
        output_frame = frame.copy()
        
        # Convert to HSV for better color detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Create a mask for the target color
        mask = cv2.inRange(hsv, self.lower_color, self.upper_color)
        
        # Apply morphological operations to clean up the mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        # Find contours in the mask
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Find the largest contour
        ball_center = None
        if contours:
            largest_contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest_contour)
            
            if area > self.min_blob_size:
                # Calculate circularity to ensure it's roughly a circle
                perimeter = cv2.arcLength(largest_contour, True)
                circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0
                
                if circularity > 0.7:  # 1.0 is a perfect circle
                    # Draw the contour
                    cv2.drawContours(output_frame, [largest_contour], 0, (0, 255, 0), 2)
                    
                    # Get the center using moments
                    M = cv2.moments(largest_contour)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        ball_center = (cx, cy)
                        
                        # Draw the center point
                        cv2.circle(output_frame, ball_center, 5, (255, 0, 0), -1)
                        
                        # Track position if tracking is enabled
                        if self.tracking:
                            current_time = time.time()
                            if self.start_time is None:
                                self.start_time = current_time
                            
                            relative_time = current_time - self.start_time
                            self.positions.append(cy)
                            self.timestamps.append(relative_time)
                            
                            # Detect extreme points for period calculation
                            self.detect_extreme_points(cy, relative_time)
                            
                            # Draw the motion trail
                            self.draw_motion_trail(output_frame)
        
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
        
        trail_length = min(20, len(self.positions))
        points = []
        
        for i in range(-trail_length, 0):
            x = int((self.timestamps[i] * 100) % frame.shape[1])  # Scale time to create nice trail
            y = int(self.positions[i])
            points.append((x, y))
        
        # Draw connecting lines
        for i in range(1, len(points)):
            opacity = int(255 * (i / len(points)))
            color = (0, 0, opacity)
            cv2.line(frame, points[i-1], points[i], color, 2)
    
    def get_tracking_data(self):
        """Return the current tracking data as a JSON-serializable dict."""
        data = {
            'positions': list(self.positions),
            'timestamps': list(self.timestamps),
            'period': self.current_period
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

def process_frames_thread():
    """Background thread to continuously process frames."""
    while tracker.cap and tracker.cap.isOpened():
        tracker.process_frame()
        time.sleep(0.03)  # ~30fps

if __name__ == '__main__':
    print("Starting Pendulum Tracker Server...")
    print("Open http://127.0.0.1:5000 in your web browser")
    app.run(debug=False, threaded=True)