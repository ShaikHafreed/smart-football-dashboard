"""
Unit tests for backend/server.py. No real network calls are made -- every
Supabase request (requests.get/post/patch) is mocked, so these run fast
and don't need real credentials or a live database.
"""
import sys
import io
import os
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


def _fake_response(status_ok=True, json_data=None):
    resp = MagicMock()
    resp.ok = status_ok
    resp.json.return_value = json_data if json_data is not None else []
    return resp


@pytest.fixture(autouse=True)
def reset_state():
    """Every test gets a clean slate -- these dicts are module-level and
    would otherwise leak state between tests."""
    server.device_state.clear()
    server.device_session_cache.clear()
    server.SUPABASE_URL = "https://fake-project.supabase.co"
    server.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
    yield
    server.device_state.clear()
    server.device_session_cache.clear()


def _seed_binding(device_id, binding):
    """Prime the active-session cache, standing in for what the durable
    lookup would have returned. `binding` of None means "the database says
    no session is open on this device"."""
    server.device_session_cache[device_id] = {"binding": binding, "cached_at": time.time()}


def _simulate_restart():
    """Everything this process holds in memory, gone -- exactly what a
    Render sleep, redeploy or a request landing on a fresh worker does.
    Anything that still works afterwards works because it is durable."""
    server.device_state.clear()
    server.device_session_cache.clear()


def _open_session_row(session_id="s1", player_id="p1", started_at=None):
    started = started_at or datetime.now(timezone.utc).isoformat()
    return {"id": session_id, "player_id": player_id, "started_at": started}


@pytest.fixture
def client():
    server.app.config["TESTING"] = True
    server.limiter.enabled = False  # rate limits would otherwise persist across tests in one process
    return server.app.test_client()


# ==========================================
# _to_float
# ==========================================

class TestToFloat:
    def test_valid_number_string(self):
        assert server._to_float("12.5") == 12.5

    def test_valid_int(self):
        assert server._to_float(7) == 7.0

    def test_invalid_string_returns_default(self):
        assert server._to_float("not-a-number") == 0

    def test_none_returns_default(self):
        assert server._to_float(None) == 0

    def test_custom_default(self):
        assert server._to_float("bad", default=-1) == -1


# ==========================================
# authenticate_device
# ==========================================

class TestAuthenticateDevice:
    def test_missing_device_id(self):
        assert server.authenticate_device({"device_token": "x"}) is None

    def test_missing_device_token(self):
        assert server.authenticate_device({"device_id": "x"}) is None

    @patch("server.requests.get")
    def test_device_not_found(self, mock_get):
        mock_get.return_value = _fake_response(json_data=[])
        result = server.authenticate_device({"device_id": "missing", "device_token": "x"})
        assert result is None

    @patch("server.requests.get")
    def test_wrong_token_rejected(self, mock_get):
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "correct-token", "is_active": True}
        ])
        result = server.authenticate_device({"device_id": "d1", "device_token": "wrong-token"})
        assert result is None

    @patch("server.requests.get")
    def test_inactive_device_rejected(self, mock_get):
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "tok", "is_active": False}
        ])
        result = server.authenticate_device({"device_id": "d1", "device_token": "tok"})
        assert result is None

    @patch("server.requests.get")
    def test_correct_credentials_accepted(self, mock_get):
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "correct-token", "is_active": True}
        ])
        result = server.authenticate_device({"device_id": "d1", "device_token": "correct-token"})
        assert result is not None
        assert result["id"] == "d1"


# ==========================================
# ingest_reading
# ==========================================

class TestClamp:
    def test_value_within_bounds_unchanged(self):
        assert server._clamp(50, (0, 200)) == 50

    def test_negative_value_clamped_to_floor(self):
        assert server._clamp(-10, (0, 200)) == 0

    def test_huge_value_clamped_to_ceiling(self):
        assert server._clamp(999999, (0, 200)) == 200


class TestIngestReading:
    def test_updates_device_state(self):
        server.ingest_reading("dev-1", {"speed": "10", "spin": "20", "force": "30", "distance": "40", "shot": "Kick Not Detected"})
        assert "dev-1" in server.device_state
        assert server.device_state["dev-1"]["latest"]["speed"] == 10.0

    def test_garbage_speed_gets_clamped_not_trusted(self):
        server.ingest_reading("dev-1", {"speed": "999999", "shot": "Kick Not Detected"})
        assert server.device_state["dev-1"]["latest"]["speed"] == server.SENSOR_BOUNDS["speed"][1]

    def test_negative_distance_clamped_to_zero(self):
        server.ingest_reading("dev-1", {"distance": "-50", "shot": "Kick Not Detected"})
        assert server.device_state["dev-1"]["latest"]["distance"] == 0

    @patch("server.requests.post")
    def test_no_persist_without_active_session(self, mock_post):
        _seed_binding("dev-1", None)  # database says: no open session on this ball
        server.ingest_reading("dev-1", {"speed": "10", "shot": "kick"})
        mock_post.assert_not_called()

    @patch("server.requests.post")
    def test_persists_real_kick_with_active_session(self, mock_post):
        mock_post.return_value = _fake_response()
        _seed_binding("dev-1", {"session_id": "s1", "player_id": "p1"})

        server.ingest_reading("dev-1", {"speed": "10", "spin": "20", "force": "30", "distance": "40", "shot": "kick"})

        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        assert kwargs["json"]["player_id"] == "p1"
        assert kwargs["json"]["device_id"] == "dev-1"

    def test_idle_reading_not_persisted_even_with_session(self):
        with patch("server.requests.post") as mock_post:
            _seed_binding("dev-1", {"session_id": "s1", "player_id": "p1"})
            server.ingest_reading("dev-1", {"speed": "0", "shot": "Kick Not Detected"})
            mock_post.assert_not_called()


# ==========================================
# Flask routes
# ==========================================

class TestRoutes:
    def test_healthz(self, client):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"

    def test_legacy_esp_data_endpoint_is_gone(self, client):
        """The unauthenticated GET ingest path was removed -- it let anyone
        write telemetry with no credentials at all."""
        resp = client.get("/esp-data?speed=99&spin=99&shot=kick")
        assert resp.status_code == 404

    def test_data_endpoint_requires_auth(self, client):
        resp = client.get("/data?device_id=d1")
        assert resp.status_code == 401

    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_data_endpoint_rejects_someone_elses_device(self, mock_user, mock_device, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-2"}
        resp = client.get("/data?device_id=d1", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 403

    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_data_endpoint_owner_sees_disconnected_when_no_readings(self, mock_user, mock_device, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        resp = client.get("/data?device_id=d1", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 200
        assert resp.get_json()["connected"] is False

    def test_api_data_rejects_missing_auth(self, client):
        resp = client.post("/api/data", json={"speed": 5})
        assert resp.status_code == 401

    @patch("server.requests.get")
    def test_api_data_rejects_bad_token(self, mock_get, client):
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "real-token", "is_active": True}
        ])
        resp = client.post("/api/data", json={"device_id": "d1", "device_token": "wrong", "speed": 5})
        assert resp.status_code == 401

    @patch("server.requests.patch")
    @patch("server.requests.get")
    def test_api_data_accepts_valid_device(self, mock_get, mock_patch, client):
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "real-token", "is_active": True}
        ])
        mock_patch.return_value = _fake_response()

        resp = client.post("/api/data", json={
            "device_id": "d1", "device_token": "real-token",
            "speed": 12, "spin": 5, "force": 100, "distance": 30, "shot": "Kick Not Detected",
        })
        assert resp.status_code == 200

    def test_device_register_requires_device_uid(self, client):
        resp = client.post("/api/device/register", json={"pairing_code": "ABCD1234"})
        assert resp.status_code == 400

    def test_device_register_requires_pairing_code(self, client):
        resp = client.post("/api/device/register", json={"device_uid": "ABC123"})
        assert resp.status_code == 400

    def test_device_register_rejects_too_short_pairing_code(self, client):
        resp = client.post("/api/device/register", json={"device_uid": "ABC123", "pairing_code": "AB"})
        assert resp.status_code == 400

    @patch("server.requests.post")
    @patch("server.requests.get")
    def test_device_register_conflict_on_claimed_uid(self, mock_get, mock_post, client):
        """The rule that predates this phase and still holds: a claimed
        device's token can never be re-fetched by knowing its uid."""
        mock_get.return_value = _fake_response(json_data=[{"id": "existing", "owner_id": "someone"}])

        resp = client.post("/api/device/register", json={"device_uid": "ABC123", "pairing_code": "ABCD1234"})

        assert resp.status_code == 409
        assert "device_token" not in resp.get_json()
        mock_post.assert_not_called()

    @patch("server.requests.post")
    @patch("server.requests.get")
    def test_device_register_creates_new_device(self, mock_get, mock_post, client):
        mock_get.return_value = _fake_response(json_data=[])  # no existing device
        mock_post.return_value = _fake_response(json_data=[{"id": "new-device-id"}])

        resp = client.post("/api/device/register", json={"device_uid": "XYZ789", "pairing_code": "ABCD1234"})

        assert resp.status_code == 201
        body = resp.get_json()
        assert body["device_id"] == "new-device-id"
        assert "device_token" in body

        # Only hashes are persisted -- never the token, never the code.
        stored = mock_post.call_args[1]["json"]
        assert stored["device_token_hash"] == server._hash_secret(body["device_token"])
        assert "device_token" not in stored
        assert stored["pairing_code_hash"] == server._hash_pairing_code("XYZ789", "ABCD1234")
        assert "pairing_code" not in stored


class TestDeleteAccount:
    def test_requires_bearer_token(self, client):
        resp = client.delete("/api/account")
        assert resp.status_code == 401

    @patch("server.requests.get")
    def test_rejects_invalid_session(self, mock_get, client):
        mock_get.return_value = _fake_response(status_ok=False)
        resp = client.delete("/api/account", headers={"Authorization": "Bearer bad-token"})
        assert resp.status_code == 401

    @patch("server.requests.delete")
    @patch("server.requests.get")
    def test_deletes_only_the_authenticated_caller(self, mock_get, mock_delete, client):
        mock_get.return_value = _fake_response(json_data={"id": "user-123"})
        mock_delete.return_value = _fake_response()

        resp = client.delete("/api/account", headers={"Authorization": "Bearer valid-token"})

        assert resp.status_code == 200
        called_url = mock_delete.call_args[0][0]
        assert called_url.endswith("/auth/v1/admin/users/user-123")


# ==========================================
# Session binding authorization
#
# /api/session/start decides which player every subsequent kick from a ball
# is written to. These tests exist because it used to accept that binding
# from anyone, with no authentication and no ownership check at all.
# ==========================================

AUTH = {"Authorization": "Bearer fake-user-token"}


def _select_stub(players=None, sessions=None, members=None, devices=None):
    """Stands in for server._select so the ownership logic itself is
    exercised, rather than being mocked out wholesale."""
    def _stub(table, params, strict=False):
        if table == "football_players":
            return players or []
        if table == "football_sessions":
            return sessions or []
        if table == "football_org_members":
            return members or []
        if table == "football_devices":
            return devices or []
        return []
    return _stub


def _hashed_device(device_id="d1", token="real-token", owner_id="user-1", active=True):
    """A device row as it is stored after this phase: hash only, no plaintext."""
    return {
        "id": device_id,
        "device_uid": "UID-" + device_id,
        "device_token": None,
        "device_token_hash": server._hash_secret(token),
        "owner_id": owner_id,
        "is_active": active,
    }


def _owned_session_row(user_id="user-1", player_id="p1", device_id="d1", ended_at=None):
    return {"user_id": user_id, "player_id": player_id, "device_id": device_id, "ended_at": ended_at}


START_BODY = {"device_id": "d1", "player_id": "p1", "session_id": "s1"}


class TestSessionAuthorization:
    def test_start_requires_authentication(self, client):
        resp = client.post("/api/session/start", json=START_BODY)
        assert resp.status_code == 401
        assert server.device_session_cache == {}

    @patch("server._patch")
    def test_stop_requires_authentication(self, mock_patch, client):
        _seed_binding("d1", {"session_id": "s1", "player_id": "p1"})
        resp = client.post("/api/session/stop", json={"device_id": "d1"})
        assert resp.status_code == 401
        mock_patch.assert_not_called()  # nothing closed in the database
        assert "d1" in server.device_session_cache

    @patch("server.get_authenticated_user_id")
    def test_start_requires_device_and_player(self, mock_user, client):
        mock_user.return_value = "user-1"
        resp = client.post("/api/session/start", json={}, headers=AUTH)
        assert resp.status_code == 400

    @patch("server.get_authenticated_user_id")
    def test_start_requires_session_id(self, mock_user, client):
        """Without it there is no durable row to bind to, so a restarted
        process would have nothing to recover."""
        mock_user.return_value = "user-1"
        resp = client.post("/api/session/start", json={"device_id": "d1", "player_id": "p1"}, headers=AUTH)
        assert resp.status_code == 400

    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_someone_elses_device(self, mock_user, mock_device, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-2"}

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)
        assert resp.status_code == 403
        assert server.device_session_cache == {}

    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_someone_elses_player(self, mock_user, mock_device, mock_select, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        # Player belongs to another account and is not shared via an org.
        mock_select.side_effect = _select_stub(players=[{"user_id": "user-2", "org_id": None}])

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)
        assert resp.status_code == 403
        assert server.device_session_cache == {}

    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_unknown_player(self, mock_user, mock_device, mock_select, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(players=[])

        resp = client.post(
            "/api/session/start",
            json={"device_id": "d1", "player_id": "ghost", "session_id": "s1"},
            headers=AUTH,
        )
        assert resp.status_code == 403

    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_someone_elses_session_id(self, mock_user, mock_device, mock_select, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row(user_id="user-2")],
        )

        resp = client.post(
            "/api/session/start",
            json={"device_id": "d1", "player_id": "p1", "session_id": "s-other"},
            headers=AUTH,
        )
        assert resp.status_code == 403
        assert server.device_session_cache == {}

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_accepts_own_device_player_and_session(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row()],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)
        assert resp.status_code == 200
        assert server.device_session_cache["d1"]["binding"] == {"session_id": "s1", "player_id": "p1"}

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_accepts_org_shared_player(self, mock_user, mock_device, mock_select, mock_patch, client):
        """A coach recording for a player owned by another coach in the same
        org stays supported -- this mirrors the football_players RLS model."""
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-2", "org_id": "org-1"}],
            members=[{"user_id": "user-1"}],
            sessions=[_owned_session_row()],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)
        assert resp.status_code == 200
        assert server.device_session_cache["d1"]["binding"]["player_id"] == "p1"

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_stop_rejects_someone_elses_device(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-2"}
        _seed_binding("d1", {"session_id": "s1", "player_id": "p1"})

        resp = client.post("/api/session/stop", json={"device_id": "d1"}, headers=AUTH)
        assert resp.status_code == 403
        mock_patch.assert_not_called()
        assert "d1" in server.device_session_cache

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_stop_clears_own_device_binding(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        _seed_binding("d1", {"session_id": "s1", "player_id": "p1"})

        resp = client.post("/api/session/stop", json={"device_id": "d1"}, headers=AUTH)
        assert resp.status_code == 200
        assert "d1" not in server.device_session_cache


# ==========================================
# Durable active-session state
#
# The binding between a ball and the player its kicks belong to lives in
# football_sessions (open row, newest started_at), NOT in process memory.
# These tests are the reason that matters: everything below clears every
# in-memory dict first, the way a Render sleep, redeploy or a request
# landing on a fresh worker does.
# ==========================================

class TestDurableSessionState:
    @patch("server._select")
    def test_lookup_resolves_open_session_from_database(self, mock_select):
        mock_select.side_effect = _select_stub(sessions=[_open_session_row()])

        binding = server.get_active_session("d1")

        assert binding == {"session_id": "s1", "player_id": "p1"}

    @patch("server._select")
    def test_lookup_asks_for_newest_open_session_only(self, mock_select):
        """Conflicting bindings are resolved in the database, not by luck:
        open rows only, newest first, one row."""
        mock_select.side_effect = _select_stub(sessions=[_open_session_row()])

        server.get_active_session("d1")

        _, params = mock_select.call_args[0][:2]
        assert params["device_id"] == "eq.d1"
        assert params["ended_at"] == "is.null"
        assert params["order"] == "started_at.desc"
        assert params["limit"] == "1"

    @patch("server._select")
    def test_no_open_session_resolves_to_none(self, mock_select):
        mock_select.side_effect = _select_stub(sessions=[])
        assert server.get_active_session("d1") is None

    @patch("server._select")
    def test_stale_open_session_is_ignored(self, mock_select):
        """A session left open by a client that crashed must not still be
        claiming kicks the next day."""
        long_ago = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        mock_select.side_effect = _select_stub(sessions=[_open_session_row(started_at=long_ago)])

        assert server.get_active_session("d1") is None

    @patch("server._select")
    def test_open_session_without_player_is_ignored(self, mock_select):
        mock_select.side_effect = _select_stub(sessions=[_open_session_row(player_id=None)])
        assert server.get_active_session("d1") is None

    @patch("server._select")
    def test_lookup_is_cached_between_kicks(self, mock_select):
        mock_select.side_effect = _select_stub(sessions=[_open_session_row()])

        server.get_active_session("d1")
        server.get_active_session("d1")

        assert mock_select.call_count == 1  # second kick served from cache

    @patch("server._select")
    def test_expired_cache_is_refreshed_from_database(self, mock_select):
        mock_select.side_effect = _select_stub(sessions=[_open_session_row()])

        server.get_active_session("d1")
        server.device_session_cache["d1"]["cached_at"] -= server.ACTIVE_SESSION_CACHE_TTL_SECONDS + 1
        server.get_active_session("d1")

        assert mock_select.call_count == 2


class TestRestartRecovery:
    @patch("server.requests.post")
    @patch("server._select")
    def test_shot_still_attributed_after_process_restart(self, mock_select, mock_post):
        """The critical path: a session started before the restart keeps
        collecting kicks after it, with no client involvement."""
        mock_post.return_value = _fake_response()
        mock_select.side_effect = _select_stub(sessions=[_open_session_row("sess-9", "player-9")])

        # A session is running and a kick lands normally.
        server.ingest_reading("d1", {"speed": "10", "shot": "kick"})
        assert mock_post.call_count == 1

        _simulate_restart()
        assert server.device_session_cache == {}  # nothing left in memory

        # Next kick from the same ball, served by a process that never saw
        # /api/session/start.
        server.ingest_reading("d1", {"speed": "12", "shot": "kick"})

        assert mock_post.call_count == 2
        _, kwargs = mock_post.call_args
        assert kwargs["json"]["player_id"] == "player-9"
        assert kwargs["json"]["session_id"] == "sess-9"
        assert kwargs["json"]["device_id"] == "d1"

    @patch("server.requests.post")
    @patch("server._select")
    def test_stopped_session_does_not_resume_after_restart(self, mock_select, mock_post):
        """The mirror image: once the row is closed, a restart must not
        resurrect the binding from anywhere."""
        mock_select.side_effect = _select_stub(sessions=[])  # nothing open any more
        _simulate_restart()

        server.ingest_reading("d1", {"speed": "10", "shot": "kick"})

        mock_post.assert_not_called()

    @patch("server.requests.patch")
    @patch("server.requests.get")
    def test_api_data_attributes_kick_after_restart(self, mock_get, mock_patch, client):
        """End to end over HTTP: authenticated device -> durable lookup ->
        football_shots insert, with no pre-existing in-memory state."""
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "real-token", "is_active": True, "owner_id": "user-1"}
        ])
        mock_patch.return_value = _fake_response()
        _simulate_restart()

        with patch("server._select") as mock_select, patch("server.requests.post") as mock_post:
            mock_select.side_effect = _select_stub(
                sessions=[_open_session_row("sess-9", "player-9")],
                devices=[_hashed_device()],
            )
            mock_post.return_value = _fake_response()

            resp = client.post("/api/data", json={
                "device_id": "d1", "device_token": "real-token",
                "speed": 12, "spin": 5, "force": 100, "distance": 30, "shot": "kick",
            })

        assert resp.status_code == 200
        assert mock_post.call_args[1]["json"]["player_id"] == "player-9"


class TestIngestFailsSafely:
    @patch("server.requests.post")
    @patch("server._select")
    def test_unresolvable_session_state_raises_rather_than_dropping(self, mock_select, mock_post):
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        with pytest.raises(server.SessionStateUnavailable):
            server.ingest_reading("d1", {"speed": "10", "shot": "kick"})

        mock_post.assert_not_called()

    @patch("server._select")
    def test_last_known_binding_survives_a_transient_lookup_failure(self, mock_select):
        _seed_binding("d1", {"session_id": "s1", "player_id": "p1"})
        server.device_session_cache["d1"]["cached_at"] -= server.ACTIVE_SESSION_CACHE_TTL_SECONDS + 1
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        assert server.get_active_session("d1") == {"session_id": "s1", "player_id": "p1"}

    @patch("server.requests.patch")
    @patch("server.requests.get")
    def test_api_data_returns_503_so_the_firmware_retries(self, mock_get, mock_patch, client):
        """503, not 200 and not a silent drop: the sketch re-buffers any
        non-200 reading and sends it again later."""
        mock_get.return_value = _fake_response(json_data=[
            {"id": "d1", "device_token": "real-token", "is_active": True}
        ])
        mock_patch.return_value = _fake_response()

        with patch("server._select") as mock_select:
            mock_select.side_effect = server.SessionStateUnavailable("supabase down")
            resp = client.post("/api/data", json={
                "device_id": "d1", "device_token": "real-token",
                "speed": 12, "shot": "kick",
            })

        assert resp.status_code == 503
        assert "supabase" not in resp.get_json()["error"].lower()  # no internals leaked

    @patch("server.requests.post")
    @patch("server._select")
    def test_rejected_shot_insert_is_not_swallowed(self, mock_select, mock_post):
        mock_select.side_effect = _select_stub(sessions=[_open_session_row()])
        mock_post.return_value = _fake_response(status_ok=False)

        with pytest.raises(server.SessionStateUnavailable):
            server.ingest_reading("d1", {"speed": "10", "shot": "kick"})


class TestSessionLifecycleWrites:
    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_closes_other_open_sessions_on_the_same_device(self, mock_user, mock_device, mock_select, mock_patch, client):
        """Exactly one open row per device, so the durable lookup can never
        find two candidates."""
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row()],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 200
        table, params, payload = mock_patch.call_args_list[0][0]
        assert table == "football_sessions"
        assert params == {"device_id": "eq.d1", "ended_at": "is.null", "id": "neq.s1"}
        assert payload["ended_at"]

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_backfills_device_id_on_a_session_missing_one(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row(device_id=None)],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 200
        assert mock_patch.call_args_list[-1][0][2] == {"device_id": "d1"}

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_session_recorded_for_another_player(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row(player_id="someone-else")],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 400
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_already_ended_session(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row(ended_at="2026-01-01T00:00:00+00:00")],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 409
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_rejects_session_bound_to_another_device(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row(device_id="d2")],
        )

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 400
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_start_reports_failure_when_durable_write_fails(self, mock_user, mock_device, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_select.side_effect = _select_stub(
            players=[{"user_id": "user-1", "org_id": None}],
            sessions=[_owned_session_row()],
        )
        mock_patch.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/session/start", json=START_BODY, headers=AUTH)

        assert resp.status_code == 503
        assert server.device_session_cache == {}  # never claims a binding it couldn't persist

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_stop_closes_the_open_session_row(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}

        resp = client.post("/api/session/stop", json={"device_id": "d1"}, headers=AUTH)

        assert resp.status_code == 200
        table, params, payload = mock_patch.call_args[0]
        assert table == "football_sessions"
        assert params == {"device_id": "eq.d1", "ended_at": "is.null"}
        assert payload["ended_at"]

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_stop_reports_failure_when_the_row_cannot_be_closed(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_patch.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/session/stop", json={"device_id": "d1"}, headers=AUTH)

        assert resp.status_code == 503


# ==========================================
# Device identity, provisioning and claiming
#
# The lifecycle these cover: a board provisions itself on first boot and
# prints a pairing code; whoever is physically holding it can claim it with
# that code; nobody else can, however much they know about it.
# ==========================================

class TestProvisioning:
    @patch("server._patch")
    @patch("server.requests.post")
    @patch("server._select")
    def test_unclaimed_device_can_reprovision_itself(self, mock_select, mock_post, mock_patch, client):
        """A board whose NVS was erased used to be bricked -- 409 forever,
        needing a manual row delete. An unclaimed identity has nobody
        relying on it, so registering again rotates its credentials."""
        mock_select.side_effect = _select_stub(devices=[{"id": "d1", "owner_id": None}])
        mock_patch.return_value = [{"id": "d1"}]

        resp = client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "NEWCODE1"})

        assert resp.status_code == 200
        assert "device_token" in resp.get_json()
        mock_post.assert_not_called()  # updated in place, not duplicated

        params, payload = mock_patch.call_args[0][1], mock_patch.call_args[0][2]
        assert params["owner_id"] == "is.null"  # refuses to rotate a claimed device
        assert payload["device_token"] is None  # plaintext column cleared
        assert payload["device_token_hash"] == server._hash_secret(resp.get_json()["device_token"])
        assert payload["pairing_code_hash"] == server._hash_pairing_code("UID1", "NEWCODE1")

    @patch("server._patch")
    @patch("server._select")
    def test_reprovision_rotates_the_pairing_code(self, mock_select, mock_patch, client):
        """Squatting on someone's device_uid before their board first boots
        buys nothing: the real board takes the identity back, and the
        squatter's code stops being the one that claims it."""
        mock_select.side_effect = _select_stub(devices=[{"id": "d1", "owner_id": None}])
        mock_patch.return_value = [{"id": "d1"}]

        client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "SQUATTER"})
        first = mock_patch.call_args[0][2]["pairing_code_hash"]

        client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "REALCODE"})
        second = mock_patch.call_args[0][2]["pairing_code_hash"]

        assert first != second
        assert second == server._hash_pairing_code("UID1", "REALCODE")

    @patch("server._patch")
    @patch("server._select")
    def test_reprovision_loses_race_against_a_claim(self, mock_select, mock_patch, client):
        mock_select.side_effect = _select_stub(devices=[{"id": "d1", "owner_id": None}])
        mock_patch.return_value = []  # claimed in the gap; filter matched nothing

        resp = client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "ABCD1234"})

        assert resp.status_code == 409
        assert "device_token" not in resp.get_json()

    @patch("server._select")
    def test_registration_fails_safely_when_lookup_is_down(self, mock_select, client):
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "ABCD1234"})

        assert resp.status_code == 503

    def test_pairing_code_hash_is_salted_per_device(self):
        """The code is short enough to type, so one precomputed table must
        not cover every ball."""
        assert server._hash_pairing_code("UID1", "ABCD1234") != server._hash_pairing_code("UID2", "ABCD1234")

    def test_pairing_code_comparison_is_case_insensitive(self):
        """It is read off a serial monitor and typed by a person."""
        assert server._hash_pairing_code("UID1", "abcd1234") == server._hash_pairing_code("UID1", "ABCD1234")


class TestDeviceClaim:
    def test_claim_requires_authentication(self, client):
        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "ABCD1234"})
        assert resp.status_code == 401

    @patch("server.get_authenticated_user_id")
    def test_claim_requires_a_pairing_code(self, mock_user, client):
        mock_user.return_value = "user-1"
        resp = client.post("/api/device/claim", json={"device_uid": "UID1"}, headers=AUTH)
        assert resp.status_code == 400

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_claim_rejects_wrong_pairing_code(self, mock_user, mock_select, mock_patch, client):
        """Knowing the device id is no longer enough -- this is the whole
        point of the phase."""
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None,
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "GUESS123"}, headers=AUTH)

        assert resp.status_code == 404
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_claim_rejects_someone_elses_device(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": "user-1",
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH)

        assert resp.status_code == 404
        mock_patch.assert_not_called()

    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_claim_failures_are_indistinguishable(self, mock_user, mock_select, client):
        """Unknown device, wrong code and already-taken must all look the
        same, or claiming becomes a device_uid oracle."""
        mock_user.return_value = "user-2"

        mock_select.side_effect = _select_stub(devices=[])
        unknown = client.post("/api/device/claim", json={"device_uid": "NOPE", "pairing_code": "ABCD1234"}, headers=AUTH)

        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None,
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])
        wrong = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "WRONG123"}, headers=AUTH)

        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": "user-1",
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])
        taken = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH)

        assert unknown.status_code == wrong.status_code == taken.status_code == 404
        assert unknown.get_json() == wrong.get_json() == taken.get_json()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_legitimate_claim_succeeds(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None,
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])
        mock_patch.return_value = [{"id": "d1", "owner_id": "user-2"}]

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH)

        assert resp.status_code == 200
        table, params, payload = mock_patch.call_args[0][:3]
        assert table == "football_devices"
        assert params == {"id": "eq.d1", "owner_id": "is.null"}  # conditional: only while unclaimed
        assert payload["owner_id"] == "user-2"

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_repeat_claim_by_the_owner_is_idempotent(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_select.side_effect = _select_stub(devices=[{"id": "d1", "owner_id": "user-1"}])

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH)

        assert resp.status_code == 200
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_concurrent_claim_is_reported_not_overwritten(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None,
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])
        mock_patch.return_value = []  # someone claimed it between read and write

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH)

        assert resp.status_code == 409

    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_legacy_device_without_a_pairing_code_cannot_be_claimed(self, mock_user, mock_select, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{"id": "d1", "owner_id": None, "pairing_code_hash": None}])

        resp = client.post("/api/device/claim", json={"device_uid": "UID1", "pairing_code": "ANYTHING"}, headers=AUTH)

        assert resp.status_code == 409
        assert "firmware" in resp.get_json()["error"]


class TestDeviceRelease:
    def test_release_requires_authentication(self, client):
        resp = client.post("/api/device/release", json={"device_id": "d1"})
        assert resp.status_code == 401

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_release_rejects_a_device_you_do_not_own(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}

        resp = client.post("/api/device/release", json={"device_id": "d1"}, headers=AUTH)

        assert resp.status_code == 403
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_release_revokes_credentials_and_ownership(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        _seed_binding("d1", {"session_id": "s1", "player_id": "p1"})

        resp = client.post("/api/device/release", json={"device_id": "d1"}, headers=AUTH)

        assert resp.status_code == 200

        session_call, device_call = mock_patch.call_args_list
        # any recording on that ball is stopped...
        assert session_call[0][0] == "football_sessions"
        assert session_call[0][1] == {"device_id": "eq.d1", "ended_at": "is.null"}
        # ...and the credentials are revoked, not just the ownership
        table, params, payload = device_call[0][:3]
        assert table == "football_devices"
        assert params == {"id": "eq.d1", "owner_id": "eq.user-1"}
        assert payload["owner_id"] is None
        assert payload["device_token"] is None
        assert payload["device_token_hash"] is None
        assert payload["pairing_code_hash"] is None
        assert payload["is_active"] is False

        assert "d1" not in server.device_session_cache

    @patch("server._patch")
    @patch("server.get_device_by_id")
    @patch("server.get_authenticated_user_id")
    def test_release_reports_failure_rather_than_half_releasing(self, mock_user, mock_device, mock_patch, client):
        mock_user.return_value = "user-1"
        mock_device.return_value = {"id": "d1", "owner_id": "user-1"}
        mock_patch.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/device/release", json={"device_id": "d1"}, headers=AUTH)

        assert resp.status_code == 503


class TestDeviceTokenSecurity:
    @patch("server._select")
    def test_hashed_token_is_accepted(self, mock_select):
        mock_select.side_effect = _select_stub(devices=[_hashed_device()])
        assert server.authenticate_device({"device_id": "d1", "device_token": "real-token"})

    @patch("server._select")
    def test_wrong_token_is_rejected(self, mock_select):
        mock_select.side_effect = _select_stub(devices=[_hashed_device()])
        assert server.authenticate_device({"device_id": "d1", "device_token": "wrong"}) is None

    @patch("server._select")
    def test_revoked_device_is_rejected(self, mock_select):
        """What a released ball looks like: no credentials, deactivated."""
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None, "is_active": False,
            "device_token": None, "device_token_hash": None,
        }])
        assert server.authenticate_device({"device_id": "d1", "device_token": "old-token"}) is None

    @patch("server._select")
    def test_device_with_no_stored_credential_is_rejected(self, mock_select):
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "is_active": True, "device_token": None, "device_token_hash": None,
        }])
        assert server.authenticate_device({"device_id": "d1", "device_token": "anything"}) is None

    @patch("server._patch")
    @patch("server._select")
    def test_legacy_plaintext_token_still_works_and_is_upgraded(self, mock_select, mock_patch):
        """Devices flashed before this change keep working, and migrate
        themselves on their next request -- no fleet-wide re-provisioning."""
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "is_active": True, "device_token": "legacy-token", "device_token_hash": None,
        }])

        assert server.authenticate_device({"device_id": "d1", "device_token": "legacy-token"})

        payload = mock_patch.call_args[0][2]
        assert payload["device_token_hash"] == server._hash_secret("legacy-token")
        assert payload["device_token"] is None  # plaintext stops existing

    @patch("server._patch")
    @patch("server._select")
    def test_failed_upgrade_does_not_reject_a_valid_device(self, mock_select, mock_patch):
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "is_active": True, "device_token": "legacy-token", "device_token_hash": None,
        }])
        mock_patch.side_effect = server.SessionStateUnavailable("supabase down")

        assert server.authenticate_device({"device_id": "d1", "device_token": "legacy-token"})

    @patch("server._select")
    def test_unreadable_device_row_is_not_a_rejected_credential(self, mock_select):
        """Critical: the firmware treats 401 as "I have been revoked" and
        wipes its identity, so a Supabase blip must never present as 401."""
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        with pytest.raises(server.SessionStateUnavailable):
            server.authenticate_device({"device_id": "d1", "device_token": "real-token"})

    @patch("server._select")
    def test_api_data_returns_503_not_401_when_device_lookup_fails(self, mock_select, client):
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/data", json={"device_id": "d1", "device_token": "real-token", "speed": 5})

        assert resp.status_code == 503

    @patch("server._select")
    def test_api_data_batch_returns_503_not_401_when_device_lookup_fails(self, mock_select, client):
        mock_select.side_effect = server.SessionStateUnavailable("supabase down")

        resp = client.post("/api/data/batch", json={"device_id": "d1", "device_token": "real-token", "readings": []})

        assert resp.status_code == 503

    @patch("server.requests.patch")
    @patch("server._select")
    def test_revoked_device_cannot_write_telemetry(self, mock_select, mock_patch, client):
        mock_select.side_effect = _select_stub(devices=[_hashed_device(active=False)])

        resp = client.post("/api/data", json={
            "device_id": "d1", "device_token": "real-token", "speed": 12, "shot": "kick",
        })

        assert resp.status_code == 401

    @patch("server.requests.patch")
    @patch("server._select")
    def test_another_devices_token_cannot_write_to_this_device(self, mock_select, mock_patch, client):
        """Cross-device telemetry: credentials are bound to one row."""
        mock_select.side_effect = _select_stub(devices=[_hashed_device("d1", token="d1-token")])

        resp = client.post("/api/data", json={
            "device_id": "d1", "device_token": "d2-token", "speed": 12, "shot": "kick",
        })

        assert resp.status_code == 401


class TestNoSecretLeakage:
    @patch("server.requests.post")
    @patch("server._select")
    def test_registration_response_never_echoes_the_pairing_code(self, mock_select, mock_post, client):
        mock_select.side_effect = _select_stub(devices=[])
        mock_post.return_value = _fake_response(json_data=[{"id": "new-device-id"}])

        resp = client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "SECRET77"})

        assert "SECRET77" not in resp.get_data(as_text=True)

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_claim_response_carries_no_credentials(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(devices=[{
            "id": "d1", "owner_id": None,
            "device_token_hash": server._hash_secret("real-token"),
            "pairing_code_hash": server._hash_pairing_code("UID1", "REALCODE"),
        }])
        mock_patch.return_value = [{"id": "d1"}]

        body = client.post(
            "/api/device/claim", json={"device_uid": "UID1", "pairing_code": "REALCODE"}, headers=AUTH
        ).get_data(as_text=True)

        assert "real-token" not in body
        assert "device_token" not in body
        assert "pairing_code_hash" not in body

    @patch("server.requests.post")
    @patch("server._select")
    def test_secrets_are_never_logged(self, mock_select, mock_post, client, caplog):
        mock_select.side_effect = _select_stub(devices=[])
        mock_post.return_value = _fake_response(json_data=[{"id": "new-device-id"}])

        with caplog.at_level("DEBUG"):
            resp = client.post("/api/device/register", json={"device_uid": "UID1", "pairing_code": "SECRET77"})

        logs = caplog.text
        assert "SECRET77" not in logs
        assert resp.get_json()["device_token"] not in logs


class TestDeviceOwnershipAndSessionIntegration:
    """Phase 1's chain, re-checked against the new device model: a valid
    user session must never reach a device it does not own."""

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_claiming_does_not_grant_a_session_on_a_device_you_do_not_own(self, mock_user, mock_select, mock_patch, client):
        mock_user.return_value = "user-2"
        mock_select.side_effect = _select_stub(
            devices=[_hashed_device("d1", owner_id="user-1")],
            players=[{"user_id": "user-2", "org_id": None}],
        )

        resp = client.post(
            "/api/session/start",
            json={"device_id": "d1", "player_id": "p1", "session_id": "s1"},
            headers=AUTH,
        )

        assert resp.status_code == 403
        mock_patch.assert_not_called()

    @patch("server._patch")
    @patch("server._select")
    @patch("server.get_authenticated_user_id")
    def test_owned_device_plus_org_shared_player_still_works(self, mock_user, mock_select, mock_patch, client):
        """The legitimate coach path from Phase 1, unchanged by this phase."""
        mock_user.return_value = "user-1"
        mock_select.side_effect = _select_stub(
            devices=[_hashed_device("d1", owner_id="user-1")],
            players=[{"user_id": "user-2", "org_id": "org-1"}],
            members=[{"user_id": "user-1"}],
            sessions=[_owned_session_row()],
        )

        resp = client.post(
            "/api/session/start",
            json={"device_id": "d1", "player_id": "p1", "session_id": "s1"},
            headers=AUTH,
        )

        assert resp.status_code == 200


# ==========================================
# Transport security
#
# Every request to this service carries a credential -- a device token or a
# user's access token -- so the transport is part of the auth story, not
# separate from it.
# ==========================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _read_project_file(*parts):
    return io.open(os.path.join(PROJECT_ROOT, *parts), encoding="utf-8").read()


class TestHttpsEnforcement:
    def test_plain_http_through_the_proxy_is_refused(self, client):
        """Refused, not redirected: a 307 would re-send the credential that
        just travelled in the clear."""
        resp = client.post(
            "/api/data",
            json={"device_id": "d1", "device_token": "t"},
            headers={"X-Forwarded-Proto": "http"},
        )
        assert resp.status_code == 403

    def test_https_through_the_proxy_is_allowed(self, client):
        resp = client.post(
            "/api/data",
            json={},
            headers={"X-Forwarded-Proto": "https"},
        )
        assert resp.status_code == 401  # reached the endpoint; rejected on credentials

    def test_no_forwarded_header_is_allowed(self, client):
        """Local development: nothing in front of the app, nothing crossing
        a network."""
        resp = client.post("/api/data", json={})
        assert resp.status_code == 401

    def test_first_value_of_a_chained_header_is_used(self, client):
        resp = client.get("/data?device_id=d1", headers={"X-Forwarded-Proto": "http,https"})
        assert resp.status_code == 403

    def test_healthz_stays_reachable_for_uptime_checks(self, client):
        resp = client.get("/healthz", headers={"X-Forwarded-Proto": "http"})
        assert resp.status_code == 200

    def test_session_endpoints_are_covered_too(self, client):
        resp = client.post(
            "/api/session/start",
            json={"device_id": "d1", "player_id": "p1", "session_id": "s1"},
            headers={"X-Forwarded-Proto": "http"},
        )
        assert resp.status_code == 403


class TestSecurityHeaders:
    def test_baseline_headers_are_always_set(self, client):
        resp = client.get("/healthz")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert resp.headers["Referrer-Policy"] == "no-referrer"

    def test_hsts_only_when_the_request_arrived_over_https(self, client):
        over_https = client.get("/healthz", headers={"X-Forwarded-Proto": "https"})
        assert "max-age=31536000" in over_https.headers["Strict-Transport-Security"]

        plain = client.get("/healthz")
        assert "Strict-Transport-Security" not in plain.headers


class TestProxyIdentity:
    def test_forwarded_ip_is_ignored_when_not_behind_a_proxy(self):
        """Otherwise any caller could forge a header to get a fresh
        rate-limit bucket per request."""
        with patch.object(server, "TRUST_PROXY_HEADERS", False):
            with server.app.test_request_context(headers={"X-Forwarded-For": "9.9.9.9"}):
                assert server._client_ip() != "9.9.9.9"

    def test_forwarded_ip_is_used_when_behind_a_proxy(self):
        """Without this every device shares one bucket, and the 10/hour
        registration limit becomes fleet-wide."""
        with patch.object(server, "TRUST_PROXY_HEADERS", True):
            with server.app.test_request_context(headers={"X-Forwarded-For": "9.9.9.9, 10.0.0.1"}):
                assert server._client_ip() == "9.9.9.9"

    def test_falls_back_to_remote_addr_when_header_is_absent(self):
        with patch.object(server, "TRUST_PROXY_HEADERS", True):
            with server.app.test_request_context():
                assert server._client_ip() is not None

    def test_render_config_declares_the_proxy(self):
        assert "TRUST_PROXY_HEADERS" in _read_project_file("backend", "render.yaml")


class TestTrailingSlashRedirects:
    def test_post_with_trailing_slash_is_not_redirected(self, client):
        """A 308 on a POST re-sends the body -- device token included -- to
        the redirect target."""
        resp = client.post("/api/data/", json={})
        assert resp.status_code != 308
        assert resp.status_code == 401


class TestFirmwareDistribution:
    def test_no_published_firmware_is_a_404(self, client):
        resp = client.get("/api/firmware/latest.bin")
        assert resp.status_code == 404

    def test_version_endpoint_without_a_release(self, client):
        resp = client.get("/api/firmware/version")
        assert resp.status_code == 200
        assert resp.get_json()["available"] is False

    def test_md5_matches_the_published_bytes(self, tmp_path):
        payload = b"firmware-image-bytes"
        f = tmp_path / "latest.bin"
        f.write_bytes(payload)

        import hashlib
        assert server._file_md5(str(f)) == hashlib.md5(payload).hexdigest()

    def test_binary_is_served_with_an_integrity_header(self, client, tmp_path, monkeypatch):
        """The header the ESP32 HTTPUpdate library feeds to the Updater, so a
        truncated download is rejected before it is booted."""
        payload = b"firmware-image-bytes"
        (tmp_path / "latest.bin").write_bytes(payload)
        monkeypatch.setattr(server, "FIRMWARE_DIR", str(tmp_path))

        resp = client.get("/api/firmware/latest.bin")

        import hashlib
        assert resp.status_code == 200
        assert resp.headers["x-MD5"] == hashlib.md5(payload).hexdigest()

    def test_version_endpoint_publishes_the_image_digest(self, client, tmp_path, monkeypatch):
        import hashlib
        import json as _json

        payload = b"firmware-image-bytes"
        (tmp_path / "latest.bin").write_bytes(payload)
        (tmp_path / "latest.json").write_text(_json.dumps({"version": "1.2.0"}))
        monkeypatch.setattr(server, "FIRMWARE_DIR", str(tmp_path))

        body = client.get("/api/firmware/version").get_json()

        assert body["version"] == "1.2.0"
        assert body["md5"] == hashlib.md5(payload).hexdigest()
        assert body["size"] == len(payload)

    def test_firmware_endpoints_expose_no_credentials(self, client):
        for path in ("/api/firmware/version", "/api/firmware/latest.bin"):
            text = client.get(path).get_data(as_text=True).lower()
            assert "token" not in text
            assert "service_role" not in text


class TestFirmwareTransportConfiguration:
    """Static assertions about the sketch. It cannot be compiled or flashed
    here, so these guard the properties that matter most against a careless
    edit: no insecure TLS, no plain HTTP, certificates actually installed."""

    def setup_method(self):
        self.sketch = _read_project_file("firmware", "smart_football", "smart_football.ino")
        self.certs = _read_project_file("firmware", "smart_football", "certs.h")

    def test_insecure_tls_is_gone(self):
        # Comments still discuss what setInsecure() used to do and why; what
        # must not exist any more is a call to it.
        code = chr(10).join(l for l in self.sketch.splitlines() if not l.strip().startswith("//"))
        assert "setInsecure" not in code

    def test_certificate_authorities_are_installed(self):
        assert '#include "certs.h"' in self.sketch
        assert "setCACert(BACKEND_ROOT_CA_BUNDLE)" in self.sketch

    def test_the_bundle_contains_real_certificates(self):
        assert self.certs.count("-----BEGIN CERTIFICATE-----") >= 1
        assert self.certs.count("-----BEGIN CERTIFICATE-----") == self.certs.count("-----END CERTIFICATE-----")

    def test_no_private_key_was_ever_committed_alongside_them(self):
        assert "PRIVATE KEY" not in self.certs

    def test_every_backend_call_is_https(self):
        assert 'String("http://")' not in self.sketch
        assert self.sketch.count('String("https://")') >= 3  # register, ingest, OTA

    def test_nothing_is_sent_before_certificates_can_be_validated(self):
        """An ESP32 boots in 1970; without NTP every certificate looks
        not-yet-valid, so sends must wait rather than fall back."""
        assert "ensureTimeSynced" in self.sketch
        assert "!timeSynced" in self.sketch

    def test_credentials_are_only_ever_sent_in_a_request_body(self):
        """Never in a URL, where proxies and server logs would capture them."""
        assert "device_token=" not in self.sketch
        assert "pairing_code=" not in self.sketch


class TestFrontendTransportConfiguration:
    def test_frontend_refuses_a_plain_http_backend_from_an_https_page(self):
        client_src = _read_project_file("src", "lib", "flaskClient.js")
        assert "assertSecureBackendUrl" in client_src
        assert 'window.location.protocol !== "https:"' in client_src


# ==========================================
# Migration safety
#
# The database cannot be reached from here (no service-role key), so these
# assert the properties that make a migration safe to run unattended: it must
# not destroy data, must not weaken RLS, and must be re-runnable.
# ==========================================

MIGRATIONS_DIR = os.path.join(PROJECT_ROOT, "supabase", "migrations")


def _migration_files():
    return sorted(
        os.path.join(MIGRATIONS_DIR, f)
        for f in os.listdir(MIGRATIONS_DIR)
        if f.endswith(".sql")
    )


def _sql(path):
    """Migration text with comments stripped, lowercased -- so a sentence
    explaining why something is NOT done can't fail these checks."""
    raw = io.open(path, encoding="utf-8").read()
    lines = [l for l in raw.splitlines() if not l.strip().startswith("--")]
    return "\n".join(lines).lower()


class TestMigrationSafety:
    def test_no_migration_destroys_data(self):
        for path in _migration_files():
            sql = _sql(path)
            name = os.path.basename(path)
            assert "drop table" not in sql, name
            assert "truncate" not in sql, name
            assert "delete from" not in sql, name
            assert "drop column" not in sql, name

    def test_no_migration_disables_row_level_security(self):
        for path in _migration_files():
            sql = _sql(path)
            assert "disable row level security" not in sql, os.path.basename(path)

    def test_only_the_documented_policy_was_ever_dropped(self):
        """Phase 3 removed the client-side device claim policy on purpose.
        Nothing else may quietly drop a policy."""
        dropped = []
        for path in _migration_files():
            for line in _sql(path).splitlines():
                if "drop policy" in line:
                    dropped.append(line.strip())

        for line in dropped:
            assert (
                "anyone signed in can claim an unclaimed device" in line
                or "members can view org roster" in line  # replaced in the same migration
            ), line

    def test_phase_5_indexes_are_rerunnable(self):
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918180000_hot_indexes_and_integrity.sql"))
        create_index_statements = [l for l in sql.splitlines() if l.strip().startswith("create ") and "index" in l]
        assert create_index_statements
        for statement in create_index_statements:
            assert "if not exists" in statement, statement

    def test_phase_5_constraints_do_not_fail_on_historical_rows(self):
        """NOT VALID binds every future write without rejecting the migration
        over data nobody can retroactively fix."""
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918180000_hot_indexes_and_integrity.sql"))
        assert sql.count("add constraint") == sql.count("not valid")
        assert sql.count("add constraint") >= 3

    def test_phase_5_indexes_cover_the_hot_query_paths(self):
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918180000_hot_indexes_and_integrity.sql"))
        # The largest table, always filtered by player and ordered by time.
        assert "football_shots (player_id, created_at desc)" in sql
        # SessionList's per-session fetch, and Phase 2's attribution writes.
        assert "football_shots (session_id)" in sql
        # The RLS lookup that runs per candidate shot row.
        assert "football_players (user_id)" in sql
        # my_org_ids(), behind every org-scoped policy.
        assert "football_org_members (user_id)" in sql
        # Phase 2's durable session lookup, on the ingest path.
        assert "where ended_at is null" in sql

    def test_analytics_views_never_bypass_rls(self):
        """A security definer view here would hand every user the whole
        table's aggregates. Each one must run as the invoker."""
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918181500_analytics_aggregates.sql"))
        assert sql.count("create or replace view") == sql.count("security_invoker = true")
        assert "security_invoker = false" not in sql
        assert "security definer" not in sql

    def test_analytics_functions_run_as_the_caller(self):
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918181500_analytics_aggregates.sql"))
        assert sql.count("create or replace function") == sql.count("security invoker")

    def test_analytics_objects_are_reachable_by_the_app(self):
        sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918181500_analytics_aggregates.sql"))
        for view in ("football_player_shot_stats", "football_player_session_stats", "football_leaderboard"):
            assert f"grant select on public.{view} to authenticated" in sql, view
        assert sql.count("grant execute on function") == 2

    def test_migration_statements_are_terminated_and_balanced(self):
        for path in _migration_files():
            sql = _sql(path)
            name = os.path.basename(path)
            assert sql.count("(") == sql.count(")"), name
            assert sql.count("$$") % 2 == 0, name
            assert sql.strip().endswith(";"), name


class TestAnalyticsMetricDefinitions:
    """The aggregates moved from JavaScript into SQL. These pin the
    definitions so the move stays a move, not a redefinition."""

    def setup_method(self):
        self.sql = _sql(os.path.join(MIGRATIONS_DIR, "20260918181500_analytics_aggregates.sql"))

    def test_leaderboard_score_is_still_max_speed_plus_force(self):
        assert "max(coalesce(s.speed, 0) + coalesce(s.force, 0))" in self.sql

    def test_daily_rollup_returns_totals_not_averages(self):
        """So the caller divides sums by counts -- the same arithmetic as the
        old client-side loop, rather than an average of averages."""
        assert "sum(coalesce(s.speed, 0))" in self.sql
        assert "sum(coalesce(s.spin, 0))" in self.sql
        assert "avg(" not in self.sql

    def test_daily_buckets_use_the_callers_time_zone(self):
        assert "at time zone tz" in self.sql

    def test_shot_type_still_defaults_to_kick(self):
        assert "coalesce(s.shot_type, 'kick')" in self.sql

    def test_rollups_exclude_rows_no_one_can_own(self):
        assert self.sql.count("where player_id is not null") >= 2
