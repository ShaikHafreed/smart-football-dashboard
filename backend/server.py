import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timezone
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

# A trailing-slash redirect on a POST would re-send the request -- device
# token and all -- to the redirect target. Treating /api/data/ as /api/data
# removes that class of surprise rather than relying on nobody typing it.
app.url_map.strict_slashes = False

# Render (like any PaaS) terminates TLS at a proxy and forwards the original
# client details in X-Forwarded-* headers. Those headers are trivially
# spoofable by whoever talks to the app directly, so they are only believed
# when the deployment states it really is behind a proxy -- see
# TRUST_PROXY_HEADERS in backend/render.yaml.
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS") == "1"


def _forwarded_header(name):
    """First value of a comma-joined X-Forwarded-* header, or ''."""
    raw = request.headers.get(name, "")
    return raw.split(",")[0].strip() if raw else ""


def _client_ip():
    """Rate-limit identity. Without this, request.remote_addr behind Render
    is the proxy, so every device on earth shares one bucket and the
    10/hour registration limit becomes a fleet-wide limit -- one noisy board
    locking everyone else out of provisioning."""
    if TRUST_PROXY_HEADERS:
        forwarded = _forwarded_header("X-Forwarded-For")
        if forwarded:
            return forwarded
    return get_remote_address()

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
limiter = Limiter(_client_ip, app=app, default_limits=["200 per minute"], storage_uri="memory://")


@app.before_request
def require_https():
    """Every request to this service carries a credential: a device token, or
    a user's Supabase access token. If the edge proxy reports the client
    spoke plain HTTP, that credential has already crossed the network in the
    clear -- so this refuses the request instead of redirecting it. A 307/308
    would helpfully re-send the very secret that just leaked.

    No header at all means nothing is in front of us (local development),
    where the connection is not crossing a network to begin with."""
    if request.path == "/healthz":
        return None
    if _forwarded_header("X-Forwarded-Proto") == "http":
        return jsonify({"error": "HTTPS is required"}), 403
    return None


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Only meaningful over HTTPS, and only honoured there.
    if _forwarded_header("X-Forwarded-Proto") == "https":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response

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

# Per-device LIVE SNAPSHOT. Process memory is fine for this one: it is a
# derived, disposable view of the last reading, and the authoritative copy
# of the same values is written to football_devices by touch_device() --
# which is what the dashboard actually subscribes to over Realtime. A
# restart just means /data reports "disconnected" until the next kick.
device_state = {}  # device_id -> {"latest": {...}, "last_update": ts}

# Per-device ACTIVE SESSION BINDING -- which player every kick from a given
# ball is attributed to.
#
# This used to be the authoritative store, in process memory. It was not
# durable: a Render sleep/redeploy/restart (or a second worker) wiped it,
# after which kicks still arrived and still looked live on the dashboard
# but were silently never written to football_shots.
#
# The authoritative binding now lives in the database: the open
# football_sessions row for that device (ended_at is null, most recent
# started_at). This dict is only a short-lived cache over that lookup, so a
# burst of kicks does not mean a Supabase round-trip each -- any process can
# rebuild it from the database at any time.
device_session_cache = {}  # device_id -> {"binding": {...} | None, "cached_at": ts}

# Kept short deliberately: it bounds both how long a stopped session can
# still attract kicks on another worker, and how long a freshly started one
# stays invisible to a worker that recently cached "no session".
ACTIVE_SESSION_CACHE_TTL_SECONDS = 10

# A session left open by a client that crashed (or a tab closed without
# pressing Stop) must not keep claiming kicks days later.
ACTIVE_SESSION_MAX_AGE_SECONDS = 12 * 3600

# The legacy unauthenticated ingest endpoint (GET /esp-data) and its
# anonymous LEGACY_DEVICE_ID have been REMOVED. They accepted telemetry
# with no credentials at all, which -- combined with the previously
# unauthenticated /api/session/start -- let any caller write arbitrary
# rows into football_shots for a player they did not own. Every physical
# unit now registers and authenticates with device_id + device_token via
# POST /api/data (see firmware/smart_football/smart_football.ino).


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


def get_device_by_uid(device_uid, strict=False):
    rows = _select("football_devices", {"device_uid": f"eq.{device_uid}", "select": "*"}, strict=strict)
    return rows[0] if rows else None


def get_device_by_id(device_id, strict=False):
    """strict=True is for the ingest path: a device whose row could not be
    looked up must not be reported as "bad credentials", because the
    firmware now treats 401 as "I have been revoked" and wipes its identity.
    A transient Supabase failure has to surface as 503 instead."""
    rows = _select("football_devices", {"id": f"eq.{device_id}", "select": "*"}, strict=strict)
    return rows[0] if rows else None


class SessionStateUnavailable(Exception):
    """The durable active-session binding could not be read, or a shot could
    not be persisted.

    Deliberately NOT swallowed on the ingest path: it is surfaced to the
    device as a 503 so the firmware's offline buffer holds that kick and
    retries it later (see sendReading/flushBuffer in the sketch -- anything
    other than HTTP 200 is re-buffered). Swallowing it here is what "silently
    dropped telemetry" looked like before."""


def _select(table, params, strict=False):
    """Service-role SELECT helper. Used by the ownership checks below --
    they must see rows regardless of the caller's RLS scope, then decide
    access explicitly, rather than relying on RLS to hide them.

    Default (strict=False) returns [] on any failure, so an authorization
    check that cannot reach Supabase fails CLOSED. strict=True raises
    instead, for callers that must tell "no rows" apart from "couldn't
    look"."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        if strict:
            raise SessionStateUnavailable("Supabase not configured")
        return []
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            params=params,
            headers=_supabase_headers(),
            timeout=5,
        )
    except requests.RequestException as e:
        logger.error("Supabase select on %s failed: %s", table, e)
        if strict:
            raise SessionStateUnavailable(f"select on {table} failed") from e
        return []
    if not resp.ok:
        logger.error("Supabase select on %s failed: HTTP %s", table, resp.status_code)
        if strict:
            raise SessionStateUnavailable(f"select on {table} failed: HTTP {resp.status_code}")
        return []
    return resp.json()


def _patch(table, params, payload, returning=False):
    """Service-role PATCH helper. Always raises on failure -- every caller
    is a session lifecycle write whose failure the client must hear about,
    rather than believing a session started or stopped when it did not."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SessionStateUnavailable("Supabase not configured")
    headers = _supabase_headers()
    if returning:
        # Lets the caller see WHICH rows the filter actually matched, so a
        # conditional write (claim only if still unclaimed) can tell "done"
        # apart from "someone got there first".
        headers = {**headers, "Prefer": "return=representation"}

    try:
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/{table}",
            params=params,
            json=payload,
            headers=headers,
            timeout=5,
        )
    except requests.RequestException as e:
        raise SessionStateUnavailable(f"patch on {table} failed") from e
    if not resp.ok:
        raise SessionStateUnavailable(f"patch on {table} failed: HTTP {resp.status_code}")

    if returning:
        try:
            return resp.json() or []
        except ValueError:
            return []
    return resp


def user_owns_device(user_id, device_id):
    """A device belongs to exactly one account (football_devices.owner_id).
    Org membership deliberately does NOT grant device control -- a ball is
    claimed by one person, and only that person can bind it to a session."""
    device = get_device_by_id(device_id)
    return bool(device) and device.get("owner_id") == user_id


def user_can_access_player(user_id, player_id):
    """Mirrors the football_players RLS model: the owning account, or any
    member of the organization the player belongs to. Evaluated here
    explicitly because session binding runs under the service role."""
    rows = _select("football_players", {"id": f"eq.{player_id}", "select": "user_id,org_id"})
    if not rows:
        return False
    player = rows[0]

    if player.get("user_id") == user_id:
        return True

    org_id = player.get("org_id")
    if not org_id:
        return False

    members = _select(
        "football_org_members",
        {"org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}", "select": "user_id"},
    )
    return bool(members)


def get_session_for_binding(session_id):
    """The full football_sessions row a start request wants to bind to.
    Returned rather than just an ownership boolean because start_session
    checks owner, player, device and ended_at against it -- all from one
    lookup."""
    rows = _select(
        "football_sessions",
        {"id": f"eq.{session_id}", "select": "user_id,player_id,device_id,ended_at"},
    )
    return rows[0] if rows else None


# Device secrets are 256 bits of CSPRNG output, not user-chosen passwords,
# so a single SHA-256 is the right primitive here: there is nothing to
# brute-force and no need for a slow KDF. The pairing code is short enough
# to be typed by a human, so it is salted with the device_uid to stop one
# precomputed table covering every device.
def _hash_secret(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def _hash_pairing_code(device_uid, pairing_code):
    return hashlib.sha256(f"{device_uid}:{str(pairing_code).strip().upper()}".encode("utf-8")).hexdigest()


def _upgrade_token_to_hash(device_id, device_token):
    """Migrate one device from a plaintext token to a hash, the first time
    it authenticates after this change. Best effort: a failure here must
    not reject an otherwise valid device, it just gets retried next time."""
    try:
        _patch(
            "football_devices",
            {"id": f"eq.{device_id}"},
            {"device_token_hash": _hash_secret(device_token), "device_token": None},
        )
        logger.info("Upgraded device %s to a hashed token", device_id)
    except SessionStateUnavailable:
        logger.warning("Could not upgrade device %s to a hashed token yet", device_id)


def authenticate_device(data):
    """Validate device_id + device_token from a request body. Returns the
    device row on success, or None. Comparison is constant-time either way,
    to avoid leaking the correct value one character at a time via timing.

    Raises SessionStateUnavailable if the device row could not be read at
    all -- see get_device_by_id's note on why that must not look like a
    rejected credential."""
    device_id = data.get("device_id")
    device_token = data.get("device_token")
    if not device_id or not device_token:
        return None

    device = get_device_by_id(device_id, strict=True)
    if not device or not device.get("is_active", True):
        return None

    stored_hash = device.get("device_token_hash")
    if stored_hash:
        if not hmac.compare_digest(str(stored_hash), _hash_secret(device_token)):
            return None
        return device

    # Transitional: a device flashed before hashed tokens existed. Accept its
    # plaintext token once, then upgrade the row in place so the plaintext
    # stops existing -- no fleet-wide re-provisioning, no device left behind.
    legacy_token = device.get("device_token")
    if not legacy_token or not hmac.compare_digest(str(legacy_token), str(device_token)):
        return None

    _upgrade_token_to_hash(device["id"], device_token)
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

PAIRING_CODE_MIN_LEN = 6
PAIRING_CODE_MAX_LEN = 32


@app.route("/api/device/register", methods=["POST"])
@limiter.limit("10 per hour")
def register_device():
    """First-boot provisioning. Necessarily unauthenticated -- a ball being
    flashed has no user attached to it yet -- so the trust does not come
    from this call. It comes from what the board supplies: a pairing_code it
    generated itself and prints to Serial, stored here only as a salted
    hash. Claiming the device later requires producing that code, so
    registering a device_uid you don't physically have gets you nothing.

    A device that is already CLAIMED is never re-provisioned here: 409, no
    credentials. Its owner must release it first (POST /api/device/release).
    An UNCLAIMED identity has no one relying on it yet, so a repeat
    registration rotates its credentials instead of failing -- that is what
    lets a board whose NVS was erased recover on its own, and what makes
    pre-registering someone else's device_uid pointless: the real board
    takes the identity back the moment it boots."""
    data = request.json or {}
    device_uid = (data.get("device_uid") or "").strip()
    pairing_code = (data.get("pairing_code") or "").strip()

    if not device_uid:
        return jsonify({"error": "device_uid is required"}), 400

    if not PAIRING_CODE_MIN_LEN <= len(pairing_code) <= PAIRING_CODE_MAX_LEN:
        return jsonify({"error": "a pairing_code of 6-32 characters is required"}), 400

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Supabase not configured"}), 503

    try:
        existing = get_device_by_uid(device_uid, strict=True)
    except SessionStateUnavailable:
        return jsonify({"error": "registration temporarily unavailable, retry"}), 503

    device_token = secrets.token_hex(32)
    credentials = {
        "device_token_hash": _hash_secret(device_token),
        "pairing_code_hash": _hash_pairing_code(device_uid, pairing_code),
    }

    if existing:
        if existing.get("owner_id"):
            logger.info("Refused re-registration of claimed device %s", existing["id"])
            return jsonify({"error": "device already registered and claimed"}), 409

        try:
            # Filtered on owner_id is null: if someone claims it in the gap,
            # nothing is written and no credentials are handed out.
            rows = _patch(
                "football_devices",
                {"id": f"eq.{existing['id']}", "owner_id": "is.null"},
                {**credentials, "device_token": None, "is_active": True},
                returning=True,
            )
        except SessionStateUnavailable:
            return jsonify({"error": "registration temporarily unavailable, retry"}), 503

        if not rows:
            return jsonify({"error": "device already registered and claimed"}), 409

        logger.info("Re-provisioned unclaimed device %s", existing["id"])
        return jsonify({"device_id": existing["id"], "device_token": device_token}), 200

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/football_devices",
            json={"device_uid": device_uid, **credentials},
            headers={**_supabase_headers(), "Prefer": "return=representation"},
            timeout=5,
        )
    except requests.RequestException as e:
        logger.error("Device registration failed for uid %s: %s", device_uid, e)
        return jsonify({"error": "failed to register device"}), 500

    if not resp.ok:
        logger.error("Device registration rejected for uid %s: HTTP %s", device_uid, resp.status_code)
        return jsonify({"error": "failed to register device"}), 500

    row = resp.json()[0]
    logger.info("Registered new device %s", row["id"])
    return jsonify({"device_id": row["id"], "device_token": device_token}), 201


# Deliberately identical for "no such device", "wrong code" and "already
# someone else's": claiming must not double as a way to find out which
# device_uids exist or which are taken.
CLAIM_FAILED = {"error": "no unclaimed device matches that ID and pairing code"}


@app.route("/api/device/claim", methods=["POST"])
@limiter.limit("20 per hour")
@require_user_auth
def claim_device(user_id):
    """Take ownership of a ball by proving you are holding it.

    Claiming used to be a plain client-side UPDATE any signed-in user could
    run against any unclaimed row, with the list of unclaimed devices handed
    out to everyone -- first to look, wins. It now requires the pairing code
    the board prints to Serial, checked server-side against a salted hash."""
    data = request.json or {}
    device_uid = (data.get("device_uid") or "").strip()
    pairing_code = (data.get("pairing_code") or "").strip()

    if not device_uid or not pairing_code:
        return jsonify({"error": "device_uid and pairing_code are required"}), 400

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Supabase not configured"}), 503

    try:
        device = get_device_by_uid(device_uid, strict=True)
    except SessionStateUnavailable:
        return jsonify({"error": "claim temporarily unavailable, retry"}), 503

    if not device:
        return jsonify(CLAIM_FAILED), 404

    # Idempotent for the rightful owner: re-submitting a claim (a retry, a
    # double-tap) is not an error.
    if device.get("owner_id") == user_id:
        return jsonify({"message": "Device already claimed", "device_id": device["id"]}), 200

    if device.get("owner_id"):
        logger.info("Rejected claim on already-owned device %s by user %s", device["id"], user_id)
        return jsonify(CLAIM_FAILED), 404

    stored_code_hash = device.get("pairing_code_hash")
    if not stored_code_hash:
        # Registered by firmware that predates pairing codes. It cannot prove
        # possession, so it cannot be claimed until it re-provisions.
        return jsonify({
            "error": "this ball needs updated firmware before it can be paired — "
                     "reflash it and power-cycle it, then pair with the code it prints"
        }), 409

    if not hmac.compare_digest(str(stored_code_hash), _hash_pairing_code(device_uid, pairing_code)):
        logger.info("Rejected claim with bad pairing code on device %s by user %s", device["id"], user_id)
        return jsonify(CLAIM_FAILED), 404

    try:
        rows = _patch(
            "football_devices",
            {"id": f"eq.{device['id']}", "owner_id": "is.null"},
            {"owner_id": user_id, "claimed_at": datetime.now(timezone.utc).isoformat()},
            returning=True,
        )
    except SessionStateUnavailable:
        return jsonify({"error": "claim temporarily unavailable, retry"}), 503

    if not rows:
        # Lost the race against a concurrent claim.
        return jsonify({"error": "that device was just claimed by someone else"}), 409

    logger.info("Device %s claimed by user %s", device["id"], user_id)
    return jsonify({"message": "Device claimed", "device_id": device["id"]}), 200


@app.route("/api/device/release", methods=["POST"])
@limiter.limit("20 per hour")
@require_user_auth
def release_device(user_id):
    """Give up a ball: for handing it to someone else, or for killing a
    lost/stolen one's credentials immediately.

    Releasing revokes the device's token as well as its ownership, so the
    previous owner's board cannot keep writing telemetry into an account
    that no longer owns it. Deactivated and credential-less, the board's
    next request is rejected, which makes it re-register (new token, new
    pairing code) and become claimable again by whoever physically has it."""
    data = request.json or {}
    device_id = data.get("device_id")

    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    if not user_owns_device(user_id, device_id):
        return jsonify({"error": "device not found or not yours"}), 403

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # A released ball must not still be recording for its old owner.
        _patch(
            "football_sessions",
            {"device_id": f"eq.{device_id}", "ended_at": "is.null"},
            {"ended_at": now_iso},
        )
        _patch(
            "football_devices",
            {"id": f"eq.{device_id}", "owner_id": f"eq.{user_id}"},
            {
                "owner_id": None,
                "device_token": None,
                "device_token_hash": None,
                "pairing_code_hash": None,
                "claimed_at": None,
                "is_active": False,
            },
        )
    except SessionStateUnavailable:
        logger.exception("Could not release device %s", device_id)
        return jsonify({"error": "could not release device, please retry"}), 503

    device_session_cache.pop(device_id, None)
    device_state.pop(device_id, None)
    logger.info("Device %s released by user %s", device_id, user_id)
    return jsonify({"message": "Device released"}), 200


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


def _parse_timestamp(value):
    """PostgREST timestamptz -> aware datetime, or None if unparseable."""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def get_active_session(device_id):
    """Resolve which session (and therefore which player) this device's
    kicks belong to, from the database -- so any process, including one
    that just booted, reaches the same answer.

    Returns {"session_id", "player_id"} or None. Raises
    SessionStateUnavailable if the answer genuinely could not be looked up
    and there is no cached binding to fall back on."""
    now = time.time()
    cached = device_session_cache.get(device_id)
    if cached and now - cached["cached_at"] < ACTIVE_SESSION_CACHE_TTL_SECONDS:
        return cached["binding"]

    try:
        rows = _select(
            "football_sessions",
            {
                "device_id": f"eq.{device_id}",
                "ended_at": "is.null",
                "select": "id,player_id,started_at",
                # Most recently started open session wins, so a stray older
                # one that was never closed can't hijack the attribution.
                "order": "started_at.desc",
                "limit": "1",
            },
            strict=True,
        )
    except SessionStateUnavailable:
        if cached:
            # Better to keep attributing to the last known-good binding for a
            # few seconds than to drop a real kick over a transient blip.
            logger.warning(
                "Active-session lookup failed for device %s — reusing last known binding", device_id
            )
            return cached["binding"]
        raise

    binding = None
    if rows:
        row = rows[0]
        started_at = _parse_timestamp(row.get("started_at"))
        age = (datetime.now(timezone.utc) - started_at).total_seconds() if started_at else 0

        if not row.get("player_id"):
            logger.warning("Open session %s on device %s has no player — ignoring", row.get("id"), device_id)
        elif age > ACTIVE_SESSION_MAX_AGE_SECONDS:
            logger.warning(
                "Ignoring stale open session %s on device %s (%.1f hours old)",
                row.get("id"), device_id, age / 3600,
            )
        else:
            binding = {"session_id": row["id"], "player_id": row["player_id"]}

    device_session_cache[device_id] = {"binding": binding, "cached_at": now}
    return binding


def save_shot_to_supabase(device_id, reading):
    active = get_active_session(device_id)
    if not active:
        # No session running for this device — nothing to attribute this
        # shot to. This is a normal state, not a failure.
        return

    payload = {
        "player_id": active["player_id"],
        "session_id": active["session_id"],
        "device_id": device_id,
        "speed": reading.get("speed", 0),
        "spin": reading.get("spin", 0),
        "force": reading.get("force", 0),
        "distance": reading.get("distance", 0),
        "shot_type": reading.get("shot", "Kick Not Detected"),
    }

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/football_shots",
            json=payload,
            headers=_supabase_headers(),
            timeout=5,
        )
    except requests.RequestException as e:
        logger.error("Failed to save shot for device %s: %s", device_id, e)
        raise SessionStateUnavailable("failed to persist shot") from e

    if not resp.ok:
        logger.error("Supabase rejected shot for device %s: HTTP %s", device_id, resp.status_code)
        raise SessionStateUnavailable("failed to persist shot")


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

    try:
        device = authenticate_device(data)
    except SessionStateUnavailable:
        logger.error("Device lookup unavailable during ingest")
        return jsonify({"error": "device lookup temporarily unavailable, retry"}), 503

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
    except SessionStateUnavailable:
        # Not 200 -> the firmware re-buffers this exact reading and retries,
        # so the kick survives a Supabase blip instead of being dropped.
        logger.error("Session state unavailable while ingesting for device %s", device["id"])
        return jsonify({"error": "session state temporarily unavailable, retry"}), 503
    except Exception:
        logger.exception("Ingest failed for device %s", device["id"])
        return jsonify({"error": "failed to ingest reading"}), 500


# Batch flush for a device's offline buffer -- same auth as /api/data, but
# takes {"device_id", "device_token", "readings": [{...}, {...}]}. Each
# buffered reading is ingested in order; only the last one becomes the
# device's "live" reading, but every one that was a real kick still gets
# written to football_shots.
@app.route("/api/data/batch", methods=["POST"])
def receive_data_batch():
    data = request.json or {}

    try:
        device = authenticate_device(data)
    except SessionStateUnavailable:
        logger.error("Device lookup unavailable during batch ingest")
        return jsonify({"error": "device lookup temporarily unavailable, retry"}), 503

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
    except SessionStateUnavailable:
        logger.error("Session state unavailable while batch-ingesting for device %s", device["id"])
        return jsonify({"error": "session state temporarily unavailable, retry"}), 503
    except Exception:
        logger.exception("Batch ingest failed for device %s", device["id"])
        return jsonify({"error": "failed to ingest readings"}), 500


# ==========================================
# REACT DASHBOARD POLLS THIS FOR LIVE READINGS
# ==========================================

@app.route("/data", methods=["GET"])
@require_user_auth
def get_data(user_id):
    """Live snapshot for one device. The dashboard reads this from Supabase
    Realtime instead (see src/pages/Dashboard.jsx), so this endpoint has no
    first-party caller left -- but it used to serve any device_id to anyone
    who asked, so it is now scoped to a device the caller actually owns."""
    device_id = request.args.get("device_id")
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    if not user_owns_device(user_id, device_id):
        return jsonify({"error": "device not found or not yours"}), 403

    state = device_state.get(device_id)

    # if no data received for 5 seconds, treat the hardware as disconnected
    if not state or time.time() - state["last_update"] > 5:
        return jsonify({**DISCONNECTED, "id": 0})

    return jsonify({**state["latest"], "id": state["last_update"]})


# ==========================================
# SESSION CONTEXT (which player is currently recording, per device)
# ==========================================

# This is the binding that decides which player every subsequent kick from
# a given ball is written to. It was previously unauthenticated, so anyone
# could point any device at any player_id. Every field is now verified
# against the caller's own identity before it is trusted:
#   device_id  -> must be a device this account claimed (football_devices.owner_id)
#   player_id  -> must be the caller's own player, or one in their org (mirrors RLS)
#   session_id -> must be an open session row the caller owns, for the same
#                 player and the same device
#
# session_id is REQUIRED (it was optional before): that row IS the durable
# binding, so there is nothing for a restarted process to recover without it.
@app.route("/api/session/start", methods=["POST"])
@require_user_auth
def start_session(user_id):
    data = request.json or {}
    device_id = data.get("device_id")
    player_id = data.get("player_id")
    session_id = data.get("session_id")

    if not device_id or not player_id or not session_id:
        return jsonify({"error": "device_id, player_id and session_id are required"}), 400

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Supabase not configured"}), 503

    if not user_owns_device(user_id, device_id):
        return jsonify({"error": "device not found or not yours"}), 403

    if not user_can_access_player(user_id, player_id):
        return jsonify({"error": "player not found or not yours"}), 403

    session_row = get_session_for_binding(session_id)
    if not session_row or session_row.get("user_id") != user_id:
        return jsonify({"error": "session not found or not yours"}), 403

    # The row is the source of truth for attribution, so the request must
    # agree with it -- otherwise a caller could bind a session recorded for
    # one player to kicks taken by another.
    if session_row.get("player_id") != player_id:
        return jsonify({"error": "session belongs to a different player"}), 400

    if session_row.get("ended_at"):
        return jsonify({"error": "session has already ended"}), 409

    if session_row.get("device_id") not in (None, device_id):
        return jsonify({"error": "session is bound to a different device"}), 400

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # Close any other session still open on this ball first, so exactly
        # one open row can ever match the durable lookup for this device.
        _patch(
            "football_sessions",
            {"device_id": f"eq.{device_id}", "ended_at": "is.null", "id": f"neq.{session_id}"},
            {"ended_at": now_iso},
        )
        # A session created without a device_id would be invisible to the
        # durable lookup, which keys on it.
        if session_row.get("device_id") is None:
            _patch("football_sessions", {"id": f"eq.{session_id}"}, {"device_id": device_id})
    except SessionStateUnavailable:
        logger.exception("Could not establish durable session binding for device %s", device_id)
        return jsonify({"error": "could not start session, please retry"}), 503

    binding = {"session_id": session_id, "player_id": player_id}
    device_session_cache[device_id] = {"binding": binding, "cached_at": time.time()}
    logger.info("Session %s started on device %s by user %s", session_id, device_id, user_id)
    return jsonify({"message": "Session started", **binding}), 200


@app.route("/api/session/stop", methods=["POST"])
@require_user_auth
def stop_session(user_id):
    data = request.json or {}
    device_id = data.get("device_id")

    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    # Ownership is checked on stop too -- otherwise anyone could silently
    # end a coach's recording session and drop every kick after it.
    if not user_owns_device(user_id, device_id):
        return jsonify({"error": "device not found or not yours"}), 403

    # Closing the row is what actually stops attribution; dropping the cache
    # entry alone would be undone by the next lookup. Idempotent: the
    # frontend also sets ended_at itself, and matching zero rows is fine.
    try:
        _patch(
            "football_sessions",
            {"device_id": f"eq.{device_id}", "ended_at": "is.null"},
            {"ended_at": datetime.now(timezone.utc).isoformat()},
        )
    except SessionStateUnavailable:
        device_session_cache.pop(device_id, None)
        logger.exception("Could not close active session for device %s", device_id)
        return jsonify({"error": "could not stop session, please retry"}), 503

    device_session_cache.pop(device_id, None)
    logger.info("Session stopped on device %s by user %s", device_id, user_id)
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

def _file_md5(path):
    """MD5 of a published firmware image. Used for the x-MD5 response header
    that the ESP32 HTTPUpdate library feeds to the Updater, so a truncated or
    corrupted download is rejected before it is booted.

    This is an INTEGRITY check, not an authenticity one -- it proves the
    bytes arrived intact, not that they came from a trusted author. See the
    README's OTA section."""
    digest = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


@app.route("/api/firmware/version", methods=["GET"])
def firmware_version():
    import json
    meta_path = os.path.join(FIRMWARE_DIR, "latest.json")
    if not os.path.exists(meta_path):
        return jsonify({"version": None, "available": False}), 200
    with open(meta_path) as f:
        meta = json.load(f)

    bin_path = os.path.join(FIRMWARE_DIR, "latest.bin")
    if os.path.exists(bin_path):
        meta = {**meta, "md5": _file_md5(bin_path), "size": os.path.getsize(bin_path)}

    return jsonify({**meta, "available": True}), 200


@app.route("/api/firmware/latest.bin", methods=["GET"])
def firmware_binary():
    bin_path = os.path.join(FIRMWARE_DIR, "latest.bin")
    if not os.path.exists(bin_path):
        return jsonify({"error": "no firmware published"}), 404

    resp = send_from_directory(FIRMWARE_DIR, "latest.bin", mimetype="application/octet-stream")
    # The header name the ESP32 HTTPUpdate library looks for.
    resp.headers["x-MD5"] = _file_md5(bin_path)
    return resp


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

# A reachability probe is cached so that a public, unauthenticated endpoint
# cannot be used to generate one upstream request per call.
HEALTH_DEPENDENCY_TTL_SECONDS = 30.0
_dependency_health = {"checked_at": 0.0, "supabase": "unknown"}


def _supabase_reachability(now=None):
    """Can this process actually reach the Supabase project it is pointed at?

    Every authenticated route verifies its caller's token against Supabase, so
    a SUPABASE_URL that does not resolve breaks all of them -- while the
    process itself keeps serving, and a health check that only reports "I am
    running" keeps saying ok. That is exactly how a typo in the deployed
    SUPABASE_URL went unnoticed in production: /healthz answered 200 the whole
    time, and nothing authenticated had been tried against it.

    Uses GoTrue's own /auth/v1/health, which needs no user and returns no
    data about anyone."""
    now = time.time() if now is None else now

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return "unconfigured"

    if now - _dependency_health["checked_at"] < HEALTH_DEPENDENCY_TTL_SECONDS:
        return _dependency_health["supabase"]

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/health",
            headers={"apikey": SUPABASE_SERVICE_ROLE_KEY},
            timeout=3,
        )
        state = "ok" if resp.ok else "error"
    except requests.RequestException:
        # Covers DNS failure, refused connections and timeouts alike: from
        # here they are the same fact -- we cannot authenticate anyone.
        state = "unreachable"

    _dependency_health.update(checked_at=now, supabase=state)
    return state


@app.route("/healthz", methods=["GET"])
def healthz():
    """Still 200 while the process is serving, so a platform health check does
    not restart-loop a relay that is merely waiting on a dependency -- but the
    body now says whether the dependency is actually reachable, because
    "status": "ok" while every authenticated request fails is the lie that
    hid a broken deployment."""
    supabase_state = _supabase_reachability()
    healthy = supabase_state == "ok"

    return jsonify({
        "status": "ok" if healthy else "degraded",
        "time": time.time(),
        "dependencies": {"supabase": supabase_state},
    }), 200


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
    # Multi-worker safe for session attribution: the active-session binding
    # lives in football_sessions (see the state block near the top of this
    # file), so any worker -- including a freshly started one after a Render
    # sleep or redeploy -- rebuilds it from the database. device_state and
    # device_session_cache are per-process caches over durable data, so the
    # worst a second worker costs is an extra lookup, not lost shots.
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
