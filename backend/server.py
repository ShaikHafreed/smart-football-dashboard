import os
import time

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

app = Flask(__name__)
CORS(app)

# ==========================================
# DEFAULT DATA
# ==========================================

DISCONNECTED = {
    "speed": 0,
    "spin": 0,
    "force": 0,
    "distance": 0,
    "shot": "Kick Not Detected",
    "connected": False,
}

latest_data = {**DISCONNECTED}
last_update_time = 0

# Which player/session is currently recording (set by the frontend
# via /api/session/start when the user hits "Start" on the Session page).
active_session = {"session_id": None, "player_id": None}


# ==========================================
# PERSIST A DETECTED SHOT TO SUPABASE
# ==========================================

def save_shot_to_supabase(reading):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Supabase not configured (see backend/.env.example) — skipping shot persistence")
        return

    if not active_session["player_id"]:
        # No session running — nothing to attribute this shot to.
        return

    payload = {
        "player_id": active_session["player_id"],
        "session_id": active_session["session_id"],
        "speed": reading.get("speed", 0),
        "spin": reading.get("spin", 0),
        "force": reading.get("force", 0),
        "distance": reading.get("distance", 0),
        "shot_type": reading.get("shot", "Kick Not Detected"),
    }

    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/football_shots",
            json=payload,
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
            },
            timeout=5,
        )
    except requests.RequestException as e:
        print("Failed to save shot to Supabase:", e)


# ==========================================
# ESP32 SENDS DATA HERE
# ==========================================

def _to_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def ingest_reading(data):
    """Update the live reading + persist a real kick. `data` is any dict-like
    (parsed JSON body or query args) with speed/spin/force/distance/shot."""
    global latest_data
    global last_update_time

    latest_data = {
        "speed": _to_float(data.get("speed", 0)),
        "spin": _to_float(data.get("spin", 0)),
        "force": _to_float(data.get("force", 0)),
        "distance": _to_float(data.get("distance", 0)),
        "shot": data.get("shot", "Kick Not Detected"),
        "connected": True,
    }

    last_update_time = time.time()

    if latest_data["shot"] != "Kick Not Detected":
        save_shot_to_supabase(latest_data)


# New firmware posts JSON here.
@app.route("/api/data", methods=["POST"])
def receive_data():
    try:
        ingest_reading(request.json or {})
        return jsonify({"message": "Data received successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Old firmware sends a GET with query params here (/esp-data?speed=..&spin=..).
# Kept so an already-flashed board works without re-uploading.
@app.route("/esp-data", methods=["GET"])
def receive_data_legacy():
    try:
        ingest_reading(request.args)
        return jsonify({"message": "Data received successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# REACT DASHBOARD POLLS THIS FOR LIVE READINGS
# ==========================================

@app.route("/data", methods=["GET"])
def get_data():

    global latest_data

    # if no data received for 5 seconds, treat the hardware as disconnected
    if time.time() - last_update_time > 5:
        latest_data = {**DISCONNECTED}

    return jsonify({**latest_data, "id": last_update_time})


# ==========================================
# SESSION CONTEXT (which player is currently recording)
# ==========================================

@app.route("/api/session/start", methods=["POST"])
def start_session():
    data = request.json or {}
    active_session["session_id"] = data.get("session_id")
    active_session["player_id"] = data.get("player_id")
    return jsonify({"message": "Session started", **active_session}), 200


@app.route("/api/session/stop", methods=["POST"])
def stop_session():
    active_session["session_id"] = None
    active_session["player_id"] = None
    return jsonify({"message": "Session stopped"}), 200


# ==========================================
# SERVER START
# ==========================================

if __name__ == "__main__":

    # Render (and most hosts) assign the port via $PORT — 5000 is only the
    # local-dev fallback. Debug mode must default OFF: once this server is
    # reachable from the public internet (not just localhost), Flask's
    # debug mode exposes an interactive in-browser code executor to anyone
    # who finds the URL. Set FLASK_DEBUG=1 locally if you want it back.
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
