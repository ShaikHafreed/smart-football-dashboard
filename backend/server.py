import hmac
import logging
import os
import secrets
import time
from functools import wraps

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("smart_football")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

app = Flask(__name__)

# Real deployed origins by default; override with a comma-separated
# ALLOWED_ORIGINS env var rather than editing code for a new frontend
# deployment (a preview URL, a new custom domain, etc).
_default_origins = (
    "https://football.hafreedshaik.online,"
    "https://smart-football-dashboard.vercel.app,"
    "http://localhost:5173,http://127.0.0.1:5173"
)
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]
CORS(app, origins=ALLOWED_ORIGINS)

# In-memory store, matching the single-worker reality documented at the
# bottom of this file -- move to a shared backend (Redis) before scaling
# past one worker, same caveat as device_state below.
limiter = Limiter(get_remote_address, app=app, default_limits=["200 per minute"], storage_uri="memory://")

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


def get_authenticated_user_id(request):
    """Resolve the caller's user id from a Supabase access token, or None.

    Never trust a user id from a request body/query string for anything
    that mutates data -- this is the one source of truth, verified against
    Supabase's own auth service on every call (no local JWT decoding, so
    there's no signing-key/JWKS to keep in sync here)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    access_token = auth_header.split(" ", 1)[1]

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    whoami = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {access_token}"},
        timeout=5,
    )
    if not whoami.ok:
        return None
    return (whoami.json() or {}).get("id")


def require_user_auth(fn):
    """Route decorator: resolves the caller's Supabase user id and passes it
    as the first argument, or short-circuits with 401. Keeps every
    user-authenticated route from re-deriving this by hand."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = get_authenticated_user_id(request)
        if not user_id:
            return jsonify({"error": "missing, invalid, or expired session"}), 401
        return fn(user_id, *args, **kwargs)
    return wrapper


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
        logger.warning("Failed to update device telemetry for %s: %s", device_id, e)


# ==========================================
# DEVICE REGISTRATION + PAIRING
# ==========================================

@app.route("/api/device/register", methods=["POST"])
@limiter.limit("10 per hour")
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


# Generous physical bounds, not calibrated thresholds -- the formulas
# behind speed/spin/force/distance are documented as uncalibrated indices,
# not real physical units yet (see Smart-Football-AI-Sensor-Formulas.docx).
# These exist to catch garbage/malicious payloads (a negative distance, a
# force in the millions from a corrupted or spoofed request), not to
# second-guess a real sensor reading that's merely unusual.
SENSOR_BOUNDS = {
    "speed": (0, 200),
    "spin": (0, 3000),
    "force": (0, 2000),
    "distance": (0, 150),
}


def _clamp(value, bounds):
    lo, hi = bounds
    return max(lo, min(hi, value))


def save_shot_to_supabase(device_id, reading):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured (see backend/.env.example) — skipping shot persistence")
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
        logger.error("Failed to save shot to Supabase for device %s: %s", device_id, e)


def ingest_reading(device_id, data):
    """Update the live reading + persist a real kick, scoped to one device.
    Returns the normalized reading so the caller can also push it to
    football_devices for Realtime subscribers."""
    reading = {
        "speed": _clamp(_to_float(data.get("speed", 0)), SENSOR_BOUNDS["speed"]),
        "spin": _clamp(_to_float(data.get("spin", 0)), SENSOR_BOUNDS["spin"]),
        "force": _clamp(_to_float(data.get("force", 0)), SENSOR_BOUNDS["force"]),
        "distance": _clamp(_to_float(data.get("distance", 0)), SENSOR_BOUNDS["distance"]),
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
# ACCOUNT DELETION (DPDP right-to-erasure)
#
# Deleting the auth.users row cascades through every football_* table
# (verified against the live schema's FK delete rules) -- profile, owned
# players and their sessions/shots, owned devices, and any organization
# this account owns (which in turn removes every other coach's membership
# in that org -- an owner deleting their account does take the org with
# them, not just their own seat in it).
# ==========================================

@app.route("/api/account", methods=["DELETE"])
@limiter.limit("5 per hour")
@require_user_auth
def delete_account(user_id):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Supabase not configured"}), 503

    del_resp = requests.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=_supabase_headers(),
        timeout=10,
    )
    if not del_resp.ok:
        logger.error("Account deletion failed for %s: %s", user_id, del_resp.text)
        return jsonify({"error": "failed to delete account"}), 500

    logger.info("Account deleted: %s", user_id)
    return jsonify({"message": "Account deleted"}), 200


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
