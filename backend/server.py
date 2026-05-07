from flask import Flask, jsonify, request
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)

# ==========================================
# DEFAULT DATA
# ==========================================

latest_data = {
    "speed": 0,
    "spin": 0,
    "force": 0,
    "distance": 0,
    "shot": "Kick Not Detected",
    "connected": False
}

last_update_time = 0

# ==========================================
# ESP32 SENDS DATA HERE
# ==========================================

@app.route("/api/data", methods=["POST"])
def receive_data():

    global latest_data
    global last_update_time

    try:

        data = request.json

        latest_data = {
            "speed": data.get("speed", 0),
            "spin": data.get("spin", 0),
            "force": data.get("force", 0),
            "distance": data.get("distance", 0),
            "shot": data.get("shot", "Kick Not Detected"),
            "connected": True
        }

        last_update_time = time.time()

        return jsonify({
            "message": "Data received successfully"
        }), 200

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500

# ==========================================
# REACT FETCHES DATA HERE
# ==========================================

@app.route("/data", methods=["GET"])
def get_data():

    global latest_data
    global last_update_time

    # ======================================
    # AUTO DISCONNECT DETECTION
    # ======================================

    current_time = time.time()

    # if no data received for 5 seconds
    if current_time - last_update_time > 5:

        latest_data = {
            "speed": 0,
            "spin": 0,
            "force": 0,
            "distance": 0,
            "shot": "Kick Not Detected",
            "connected": False
        }

    return jsonify(latest_data)

# ==========================================
# SERVER START
# ==========================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )