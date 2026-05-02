from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 🔥 GLOBAL DATA STORAGE
latest_data = {
    "speed": 0,
    "spin": 0,
    "force": 0,
    "distance": 0,
    "shot": "none",
    "connected": False
}

# ✅ ESP32 sends data here
@app.route('/esp-data', methods=['POST'])
def esp_data():
    global latest_data

    data = request.json
    print("📡 Received from ESP:", data)

    latest_data = {
        "speed": data.get("speed", 0),
        "spin": data.get("spin", 0),
        "force": data.get("force", 0),
        "distance": data.get("distance", 0),
        "shot": data.get("shot", "none"),
        "connected": True
    }

    return jsonify({"status": "ok"}), 200


# ✅ React dashboard fetches here
@app.route('/data', methods=['GET'])
def get_data():
    return jsonify(latest_data)


# ✅ Optional control APIs (for your buttons)
@app.route('/mode', methods=['POST'])
def set_mode():
    return jsonify({"status": "mode set"})


@app.route('/disconnect', methods=['POST'])
def disconnect():
    global latest_data
    latest_data["connected"] = False
    return jsonify({"status": "disconnected"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)