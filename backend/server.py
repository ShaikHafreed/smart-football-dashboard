import hmac
import os
import secrets
import time

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

app = Flask(__name__)
CORS(app)

FIRMWARE_DIR = os.path.join(os.path.dirname(__file__), "firmware_releases")
os.makedirs(FIRMWARE_DIR, exist_ok=True)

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

# Per-device live state. Keyed by device_id (uuid string).
# NOTE: this lives in process memory, which only works because this app
# currently runs as a single Render worker (see server start comment
# below). Add a second worker and devices would randomly appear/vanish
# depending which process served a given request -- move this to Redis
# (or Supabase itself) before scaling past one worker.
device_state = {}          # device_id -> {"latest": {...}, "last_update": ts}
device_active_session = {}  # device_id -> {"session_id": ..., "player_id": ...}

# The legacy unauthenticated endpoint (/esp-data) predates device identity
# entirely and has no way to say which ball it is. It keeps working so an
# already-flashed board doesn't go dark, but it can only ever represent one
# anonymous device -- exactly the multi-tenant bug the rest of this file
# fixes. Retire it once every physical unit is reflashed with device auth.
LEGACY_DEVICE_ID = "legacy-unauthenticated"


# ==========================================
# DEVICE AUTH
# ==========================================

def _supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def get_device_by_uid(device_uid):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/football_devices",
        params={"device_uid": f"eq.{device_uid}", "select": "*"},
        headers=_supabase_headers(),
        timeout=5,
    )
    rows = resp.json() if resp.ok else []
    return rows[0] if rows else None


def get_device_by_id(device_id):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/football_devices",
        params={"id": f"eq.{device_id}", "select": "*"},
        headers=_supabase_headers(),
        timeout=5,
    )
    rows = resp.json() if resp.ok else []
    return rows[0] if rows else None


def authenticate_device(data):
    """Validate device_id + device_token from a request body. Returns the
    device row on success, or None. Token comparison is constant-time to
    avoid leaking the correct token one character at a time via timing."""
    device_id = data.get("device_id")
    device_token = data.get("device_token")
    if not device_id or not device_token:
        return None

    device = get_device_by_id(device_id)
    if not device or not device.get("is_active", True):
        return None

    if not hmac.compare_digest(device["device_token"], str(device_token)):
        return None

    return device


def touch_device(device_id, firmware_version=None, battery_pct=None, wifi_rssi=None, reading=None):
    """Update last-seen + optional health telemetry + the live sensor
    snapshot for a device. Best effort -- a failed telemetry update
    should never block ingest.

    `reading`, when given, is written on EVERY call (not just real detected
    kicks) so the football_devices row always reflects current state --
    that's what the frontend subscribes to via Realtime instead of polling."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    patch = {"last_seen_at": now_iso}

    if firmware_version is not None:
        patch["firmware_version"] = firmware_version
    if battery_pct is not None:
        patch["battery_pct"] = battery_pct
    if wifi_rssi is not None:
        patch["wifi_rssi"] = wifi_rssi
    if reading is not None:
        patch["last_speed"] = reading.get("speed")
        patch["last_spin"] = reading.get("spin")
        patch["last_force"] = reading.get("force")
        patch["last_distance"] = reading.get("distance")
        patch["last_shot"] = reading.get("shot")
        patch["last_reading_at"] = now_iso

    try:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/football_devices",
            params={"id": f"eq.{device_id}"},
            json=patch,
            headers=_supabase_headers(),
            timeout=5,
        )
    except requests.RequestException as e:
        print("Failed to update device telemetry:", e)


# ==========================================
# DEVICE REGISTRATION + PAIRING
# ==========================================

@app.route("/api/device/register", methods=["POST"])
def register_device():
    """Called once by firmware on its very first boot (no stored token
    yet). Creates an unclaimed device row and returns its credentials.
    If device_uid already exists, returns 409 WITHOUT the token -- an
    already-registered device must already have its token in NVS; this
    endpoint must never let someone re-fetch a lost token just by knowing
    (or guessing) a device_uid."""
    data = request.json or {}
    device_uid = data.get("device_uid")
    if not device_uid:
        return jsonify({"error": "device_uid is required"}), 400

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Supabase not configured"}), 503

    existing = get_device_by_uid(device_uid)
    if existing:
        return jsonify({"error": "device already registered"}), 409

    device_token = secrets.token_hex(32)
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/football_devices",
        json={"device_uid": device_uid, "device_token": device_token},
        headers={**_supabase_headers(), "Prefer": "return=representation"},
        timeout=5,
    )
    if not resp.ok:
        return jsonify({"error": "failed to register device"}), 500

    row = resp.json()[0]
    return jsonify({"device_id": row["id"], "device_token": device_token}), 201


# ==========================================
# ESP32 SENDS DATA HERE
# ==========================================

def _to_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def save_shot_to_supabase(device_id, reading):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Supabase not configured (see backend/.env.example) — skipping shot persistence")
        return

    active = device_active_session.get(device_id, {})
    if not active.get("player_id"):
        # No session running for this device — nothing to attribute this shot to.
        return

    payload = {
        "player_id": active["player_id"],
        "session_id": active.get("session_id"),
        "device_id": None if device_id == LEGACY_DEVICE_ID else device_id,
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
            headers=_supabase_headers(),
            timeout=5,
        )
    except requests.RequestException as e:
        print("Failed to save shot to Supabase:", e)


def ingest_reading(device_id, data):
    """Update the live reading + persist a real kick, scoped to one device.
    Returns the normalized reading so the caller can also push it to
    football_devices for Realtime subscribers."""
    reading = {
        "speed": _to_float(data.get("speed", 0)),
        "spin": _to_float(data.get("spin", 0)),
        "force": _to_float(data.get("force", 0)),
        "distance": _to_float(data.get("distance", 0)),
        "shot": data.get("shot", "Kick Not Detected"),
        "connected": True,
    }

    device_state[device_id] = {"latest": reading, "last_update": time.time()}

    if reading["shot"] != "Kick Not Detected":
        save_shot_to_supabase(device_id, reading)

    return reading


# New firmware: authenticated, device-scoped, and reports health telemetry
# alongside the kick reading in the same request.
@app.route("/api/data", methods=["POST"])
def receive_data():
    data = request.json or {}

    device = authenticate_device(data)
    if not device:
        return jsonify({"error": "invalid or missing device credentials"}), 401

    try:
        reading = ingest_reading(device["id"], data)
        touch_device(
            device["id"],
            firmware_version=data.get("firmware_version"),
            battery_pct=data.get("battery_pct"),
            wifi_rssi=data.get("wifi_rssi"),
            reading=reading,
        )
        return jsonify({"message": "Data received successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Batch flush for a device's offline buffer -- same auth as /api/data, but
# takes {"device_id", "device_token", "readings": [{...}, {...}]}. Each
# buffered reading is ingested in order; only the last one becomes the
# device's "live" reading, but every one that was a real kick still gets
# written to football_shots.
@app.route("/api/data/batch", methods=["POST"])
def receive_data_batch():
    data = request.json or {}

    device = authenticate_device(data)
    if not device:
        return jsonify({"error": "invalid or missing device credentials"}), 401

    readings = data.get("readings") or []
    if not isinstance(readings, list):
        return jsonify({"error": "readings must be a list"}), 400

    try:
        last_reading = None
        for reading in readings:
            last_reading = ingest_reading(device["id"], reading)
        touch_device(
            device["id"],
            firmware_version=data.get("firmware_version"),
            battery_pct=data.get("battery_pct"),
            wifi_rssi=data.get("wifi_rssi"),
            reading=last_reading,
        )
        return jsonify({"message": f"{len(readings)} readings received"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Old firmware sends a GET with query params here (/esp-data?speed=..&spin=..).
# Kept so an already-flashed board works without re-uploading, but see the
# LEGACY_DEVICE_ID note above -- this is not multi-tenant safe.
@app.route("/esp-data", methods=["GET"])
def receive_data_legacy():
    try:
        ingest_reading(LEGACY_DEVICE_ID, request.args)
        return jsonify({"message": "Data received successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# REACT DASHBOARD POLLS THIS FOR LIVE READINGS
# ==========================================

@app.route("/data", methods=["GET"])
def get_data():
    device_id = request.args.get("device_id", LEGACY_DEVICE_ID)

    state = device_state.get(device_id)

    # if no data received for 5 seconds, treat the hardware as disconnected
    if not state or time.time() - state["last_update"] > 5:
        return jsonify({**DISCONNECTED, "id": 0})

    return jsonify({**state["latest"], "id": state["last_update"]})


# ==========================================
# SESSION CONTEXT (which player is currently recording, per device)
# ==========================================

@app.route("/api/session/start", methods=["POST"])
def start_session():
    data = request.json or {}
    device_id = data.get("device_id", LEGACY_DEVICE_ID)
    device_active_session[device_id] = {
        "session_id": data.get("session_id"),
        "player_id": data.get("player_id"),
    }
    return jsonify({"message": "Session started", **device_active_session[device_id]}), 200


@app.route("/api/session/stop", methods=["POST"])
def stop_session():
    data = request.json or {}
    device_id = data.get("device_id", LEGACY_DEVICE_ID)
    device_active_session.pop(device_id, None)
    return jsonify({"message": "Session stopped"}), 200


# ==========================================
# OTA FIRMWARE UPDATES
#
# Drop a compiled .bin at backend/firmware_releases/latest.bin and update
# firmware_releases/latest.json's version string to publish an update.
# Firmware checks /api/firmware/version on boot and periodically; if the
# reported version is newer than its own, it downloads and flashes
# /api/firmware/latest.bin via the ESP32 HTTPUpdate library.
# ==========================================

@app.route("/api/firmware/version", methods=["GET"])
def firmware_version():
    import json
    meta_path = os.path.join(FIRMWARE_DIR, "latest.json")
    if not os.path.exists(meta_path):
        return jsonify({"version": None, "available": False}), 200
    with open(meta_path) as f:
        meta = json.load(f)
    return jsonify({**meta, "available": True}), 200


@app.route("/api/firmware/latest.bin", methods=["GET"])
def firmware_binary():
    bin_path = os.path.join(FIRMWARE_DIR, "latest.bin")
    if not os.path.exists(bin_path):
        return jsonify({"error": "no firmware published"}), 404
    return send_from_directory(FIRMWARE_DIR, "latest.bin", mimetype="application/octet-stream")


# ==========================================
# HEALTH CHECK (for uptime monitoring)
# ==========================================

@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok", "time": time.time()}), 200


# ==========================================
# SERVER START
# ==========================================

if __name__ == "__main__":

    # Render (and most hosts) assign the port via $PORT — 5000 is only the
    # local-dev fallback. Debug mode must default OFF: once this server is
    # reachable from the public internet (not just localhost), Flask's
    # debug mode exposes an interactive in-browser code executor to anyone
    # who finds the URL. Set FLASK_DEBUG=1 locally if you want it back.
    #
    # Single worker only: device_state / device_active_session are
    # in-process dicts (see note near the top of this file). Render's free
    # tier already only gives one worker, so this matches reality, but if
    # you ever move to a paid tier with multiple workers, this breaks
    # silently -- move that state into Redis or Supabase first.
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
