import serial
import requests

ser = serial.Serial('COM3', 9600)  # change COM port

while True:
    try:
        line = ser.readline().decode().strip()
        print(line)

        speed, spin = map(float, line.split(","))

        requests.post("http://127.0.0.1:5000/esp-data", json={
            "speed": speed,
            "spin": spin,
            "force": speed * 0.5,
            "distance": speed * 2,
            "shot": "kick"
        })

    except Exception as e:
        print("Error:", e)