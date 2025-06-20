import sys
import os
import requests
import time
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QPushButton, QLabel,
    QFileDialog, QTableWidget, QTableWidgetItem, QMessageBox, QComboBox
)
from PyQt5.QtGui import QFont
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure

ESP32_IP = "192.168.4.1"  # ESP32 connected to PC's hotspot
BIN_FOLDER = "bin"

class ESP32Client(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ESP32 Lab Client")
        self.setGeometry(100, 100, 800, 600)
        self.initUI()
        self.eeprom_id = ""

    def initUI(self):
        layout = QVBoxLayout()

        self.status_label = QLabel("Status: Not connected")
        self.status_label.setFont(QFont("Arial", 12))
        layout.addWidget(self.status_label)

        self.mode_selector = QComboBox()
        self.mode_selector.addItems(["Displacement", "Oscillation"])
        layout.addWidget(self.mode_selector)

        self.connect_btn = QPushButton("1. Connect and Upload Firmware")
        self.connect_btn.clicked.connect(self.connect_and_upload)
        layout.addWidget(self.connect_btn)

        self.start_btn = QPushButton("2. Start Experiment")
        self.start_btn.clicked.connect(self.start_experiment)
        layout.addWidget(self.start_btn)

        self.data_table = QTableWidget()
        layout.addWidget(self.data_table)

        self.canvas = FigureCanvas(Figure(figsize=(5, 3)))
        self.ax = self.canvas.figure.add_subplot(111)
        layout.addWidget(self.canvas)

        self.setLayout(layout)

    def connect_and_upload(self):
        try:
            r = requests.get(f"http://{ESP32_IP}/id", timeout=5)
            self.eeprom_id = r.json()["id"]
            bin_file = os.path.join(BIN_FOLDER, f"{self.eeprom_id}.bin")

            if not os.path.exists(bin_file):
                QMessageBox.critical(self, "Error", f".bin file for ID {self.eeprom_id} not found")
                return

            self.status_label.setText(f"Uploading {bin_file} to ESP32...")
            with open(bin_file, 'rb') as f:
                files = {'update': f}
                r = requests.post(f"http://{ESP32_IP}/update", files=files)

            if r.status_code == 200:
                self.status_label.setText("Upload successful. Waiting for reboot...")
                time.sleep(5)
            else:
                raise Exception("OTA update failed")

        except Exception as e:
            QMessageBox.critical(self, "Connection Error", str(e))

    def start_experiment(self):
        mode = self.mode_selector.currentText()
        if mode == "Displacement":
            self.start_displacement()
        else:
            self.start_oscillation()

    def start_displacement(self):
        try:
            requests.get(f"http://{ESP32_IP}/start", timeout=5)
            self.status_label.setText("Collecting displacement data...")

            # Poll status
            while True:
                time.sleep(0.5)
                status = requests.get(f"http://{ESP32_IP}/status").json()
                if status["ready"]:
                    break

            data = requests.get(f"http://{ESP32_IP}/data").json()
            distances = data["distances"]
            self.show_table(distances, ["Distance (mm)"])
            self.plot_data(distances, "Sample #", "Distance (mm)")

        except Exception as e:
            QMessageBox.critical(self, "Displacement Error", str(e))

    def start_oscillation(self):
        try:
            r = requests.get(f"http://{ESP32_IP}/oscillation", timeout=20)
            data = r.json()["times"]
            self.show_table(data, ["Time (ms)"])
            self.plot_data(data, "Oscillation #", "Time (ms)")
        except Exception as e:
            QMessageBox.critical(self, "Oscillation Error", str(e))

    def show_table(self, data, headers):
        self.data_table.setColumnCount(len(headers))
        self.data_table.setRowCount(len(data))
        self.data_table.setHorizontalHeaderLabels(headers)
        for i, val in enumerate(data):
            self.data_table.setItem(i, 0, QTableWidgetItem(str(val)))

    def plot_data(self, y_data, xlabel, ylabel):
        self.ax.clear()
        self.ax.plot(y_data, marker='o')
        self.ax.set_xlabel(xlabel)
        self.ax.set_ylabel(ylabel)
        self.ax.grid(True)
        self.canvas.draw()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    client = ESP32Client()
    client.show()
    sys.exit(app.exec_())
