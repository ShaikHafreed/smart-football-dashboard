import serial
import requests

SERVER = "http://127.0.0.1:5000/api/data"

ser = serial.Serial('COM3', 9600)  # change COM port to match your ESP32

while True:
    try:
        line = ser.readline().decode().strip()
        print(line)

        speed, spin = map(float, line.split(","))

        requests.post(SERVER, json={
            "speed": speed,
            "spin": spin,
            "force": round(speed * 0.5, 2),
            "distance": round(speed * 2, 2),
            "shot": "kick",
        })

    except Exception as e:
        print("Error:", e)
