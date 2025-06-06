<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pendulum Oscillation Tracker (Python+OpenCV)</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            text-align: center;
            color: #333;
        }
        .container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: center;
        }
        .video-container {
            position: relative;
            width: 640px;
            height: 480px;
            border: 1px solid #ddd;
            background-color: #000;
            overflow: hidden;
        }
        #video-feed {
            width: 100%;
            height: 100%;
        }
        .controls {
            width: 100%;
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 20px;
        }
        button {
            padding: 10px 20px;
            background-color: #007BFF;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #0056b3;
        }
        button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        .data-container {
            width: 640px;
            padding: 20px;
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .chart-container {
            width: 100%;
            height: 300px;
            margin-top: 20px;
        }
        .settings {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 20px;
        }
        .settings label {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .settings input {
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .status {
            text-align: center;
            margin-top: 10px;
            font-weight: bold;
        }
        #period {
            font-size: 18px;
            text-align: center;
            margin-top: 10px;
        }
        .instructions {
            background-color: #f0f8ff;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 5px solid #007BFF;
        }
    </style>
</head>
<body>
    <h1>Pendulum Oscillation Tracker (Python+OpenCV)</h1>
    
    <div class="instructions">
        <h3>Instructions:</h3>
        <ol>
            <li>Click "Start Camera" to enable camera access</li>
            <li>Adjust the color detection settings for your pendulum</li>
            <li>Place a colored ball pendulum in view of the camera</li>
            <li>Click "Start Tracking" to begin analysis</li>
            <li>The application will track the pendulum motion and calculate its period</li>
        </ol>
    </div>

    <div class="controls">
        <button id="startBtn">Start Camera</button>
        <button id="trackBtn" disabled>Start Tracking</button>
        <button id="stopBtn" disabled>Stop Tracking</button>
        <button id="resetBtn">Reset Data</button>
    </div>

    <div class="container">
        <div class="video-container">
            <img id="video-feed" src="/video_feed" alt="Video Feed">
        </div>
        
        <div class="data-container">
            <h3>Pendulum Parameters</h3>
            <div class="settings">
                <label>
                    Hue Min:
                    <input type="range" id="hueMin" min="0" max="179" value="0" step="1">
                    <span id="hueMinValue">0</span>
                </label>
                <label>
                    Hue Max:
                    <input type="range" id="hueMax" min="0" max="179" value="50" step="1">
                    <span id="hueMaxValue">50</span>
                </label>
                <label>
                    Saturation Min:
                    <input type="range" id="satMin" min="0" max="255" value="100" step="1">
                    <span id="satMinValue">100</span>
                </label>
                <label>
                    Saturation Max:
                    <input type="range" id="satMax" min="0" max="255" value="255" step="1">
                    <span id="satMaxValue">255</span>
                </label>
                <label>
                    Value Min:
                    <input type="range" id="valMin" min="0" max="255" value="50" step="1">
                    <span id="valMinValue">50</span>
                </label>
                <label>
                    Value Max:
                    <input type="range" id="valMax" min="0" max="255" value="255" step="1">
                    <span id="valMaxValue">255</span>
                </label>
                <label>
                    Min Ball Size:
                    <input type="range" id="minSize" min="5" max="100" value="10" step="1">
                    <span id="minSizeValue">10</span>
                </label>
            </div>
            
            <div id="status" class="status">Ready to start camera</div>
            <div id="period">Period: - seconds</div>
            
            <div class="chart-container">
                <canvas id="oscillationChart"></canvas>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.7.1/chart.min.js"></script>
    
    <script>
        // Global variables
        let tracking = false;
        let startBtn = document.getElementById('startBtn');
        let trackBtn = document.getElementById('trackBtn');
        let stopBtn = document.getElementById('stopBtn');
        let resetBtn = document.getElementById('resetBtn');
        let statusDiv = document.getElementById('status');
        let periodDiv = document.getElementById('period');
        
        // Range sliders
        const hueMin = document.getElementById('hueMin');
        const hueMax = document.getElementById('hueMax');
        const satMin = document.getElementById('satMin');
        const satMax = document.getElementById('satMax');
        const valMin = document.getElementById('valMin');
        const valMax = document.getElementById('valMax');
        const minSize = document.getElementById('minSize');
        
        // Range value displays
        const hueMinValue = document.getElementById('hueMinValue');
        const hueMaxValue = document.getElementById('hueMaxValue');
        const satMinValue = document.getElementById('satMinValue');
        const satMaxValue = document.getElementById('satMaxValue');
        const valMinValue = document.getElementById('valMinValue');
        const valMaxValue = document.getElementById('valMaxValue');
        const minSizeValue = document.getElementById('minSizeValue');
        
        // Chart
        let oscillationChart = null;
        
        // Event listeners for range inputs
        hueMin.addEventListener('input', () => {
            hueMinValue.textContent = hueMin.value;
            updateColorSettings();
        });
        
        hueMax.addEventListener('input', () => {
            hueMaxValue.textContent = hueMax.value;
            updateColorSettings();
        });
        
        satMin.addEventListener('input', () => {
            satMinValue.textContent = satMin.value;
            updateColorSettings();
        });
        
        satMax.addEventListener('input', () => {
            satMaxValue.textContent = satMax.value;
            updateColorSettings();
        });
        
        valMin.addEventListener('input', () => {
            valMinValue.textContent = valMin.value;
            updateColorSettings();
        });
        
        valMax.addEventListener('input', () => {
            valMaxValue.textContent = valMax.value;
            updateColorSettings();
        });
        
        minSize.addEventListener('input', () => {
            minSizeValue.textContent = minSize.value;
            updateColorSettings();
        });
        
        // Initialize chart
        function initChart() {
            const ctx = document.getElementById('oscillationChart').getContext('2d');
            oscillationChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Pendulum Position (Y)',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1,
                        pointRadius: 0
                    }]
                },
                options: {
                    animation: false,
                    scales: {
                        x: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: 'Time (s)'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Position (pixels)'
                            },
                            reverse: true // Because in canvas, y increases downward
                        }
                    },
                    plugins: {
                        legend: {
                            display: true
                        }
                    }
                }
            });
        }
        
        // Reset chart
        function resetChart() {
            if (oscillationChart) {
                oscillationChart.data.labels = [];
                oscillationChart.data.datasets[0].data = [];
                oscillationChart.update();
            }
        }
        
        // Update color settings
        function updateColorSettings() {
            fetch('/api/update_color', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    hueMin: hueMin.value,
                    hueMax: hueMax.value,
                    satMin: satMin.value,
                    satMax: satMax.value,
                    valMin: valMin.value,
                    valMax: valMax.value,
                    minSize: minSize.value
                }),
            })
            .then(response => response.json())
            .then(data => {
                console.log('Color settings updated:', data);
            })
            .catch((error) => {
                console.error('Error updating color settings:', error);
            });
        }
        
        // Start the camera
        startBtn.addEventListener('click', () => {
            fetch('/api/start_camera', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    startBtn.disabled = true;
                    trackBtn.disabled = false;
                    statusDiv.textContent = "Camera started. Adjust settings and click 'Start Tracking'";
                    
                    // Initialize chart if needed
                    if (!oscillationChart) {
                        initChart();
                    }
                    
                    // Start polling tracking data for the chart
                    startDataPolling();
                } else {
                    statusDiv.textContent = data.message;
                }
            })
            .catch(error => {
                console.error('Error starting camera:', error);
                statusDiv.textContent = 'Error starting camera';
            });
        });
        
        // Start tracking
        trackBtn.addEventListener('click', () => {
            fetch('/api/start_tracking', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                tracking = true;
                trackBtn.disabled = true;
                stopBtn.disabled = false;
                statusDiv.textContent = "Tracking pendulum movement...";
                
                // Reset chart
                resetChart();
            })
            .catch(error => {
                console.error('Error starting tracking:', error);
                statusDiv.textContent = 'Error starting tracking';
            });
        });
        
        // Stop tracking
        stopBtn.addEventListener('click', () => {
            fetch('/api/stop_tracking', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                tracking = false;
                trackBtn.disabled = false;
                stopBtn.disabled = true;
                statusDiv.textContent = "Tracking stopped. Camera still active.";
            })
            .catch(error => {
                console.error('Error stopping tracking:', error);
                statusDiv.textContent = 'Error stopping tracking';
            });
        });
        
        // Reset data
        resetBtn.addEventListener('click', () => {
            fetch('/api/reset_tracking', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                resetChart();
                periodDiv.textContent = "Period: - seconds";
                statusDiv.textContent = "Data reset. Camera still active.";
            })
            .catch(error => {
                console.error('Error resetting data:', error);
                statusDiv.textContent = 'Error resetting data';
            });
        });
        
        // Poll tracking data periodically
        function startDataPolling() {
            setInterval(() => {
                fetch('/api/tracking_data')
                .then(response => response.json())
                .then(data => {
                    if (data.positions && data.timestamps && data.positions.length > 0) {
                        // Update chart
                        if (oscillationChart) {
                            const maxPoints = 300;
                            const startIdx = Math.max(0, data.positions.length - maxPoints);
                            
                            oscillationChart.data.labels = data.timestamps.slice(startIdx);
                            oscillationChart.data.datasets[0].data = data.positions.slice(startIdx);
                            oscillationChart.update();
                        }
                        
                        // Update period display
                        if (data.period) {
                            periodDiv.textContent = `Period: ${data.period.toFixed(3)} seconds`;
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching tracking data:', error);
                });
            }, 100); // Poll every 100ms
        }
    </script>
</body>
</html>