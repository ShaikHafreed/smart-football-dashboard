"""
Unit tests for backend/server.py. No real network calls are made -- every
Supabase request (requests.get/post/patch) is mocked, so these run fast
and don't need real credentials or a live database.
"""
import sys
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
        resp = client.post("/api/device/register", json={})
        assert resp.status_code == 400

    @patch("server.requests.post")
    @patch("server.requests.get")
    def test_device_register_conflict_on_existing_uid(self, mock_get, mock_post, client):
        mock_get.return_value = _fake_response(json_data=[{"id": "existing"}])
        resp = client.post("/api/device/register", json={"device_uid": "ABC123"})
        assert resp.status_code == 409
        mock_post.assert_not_called()  # never hands out a token for an already-registered device

    @patch("server.requests.post")
    @patch("server.requests.get")
    def test_device_register_creates_new_device(self, mock_get, mock_post, client):
        mock_get.return_value = _fake_response(json_data=[])  # no existing device
        mock_post.return_value = _fake_response(json_data=[{"id": "new-device-id"}])

        resp = client.post("/api/device/register", json={"device_uid": "XYZ789"})
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["device_id"] == "new-device-id"
        assert "device_token" in body


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


def _select_stub(players=None, sessions=None, members=None):
    """Stands in for server._select so the ownership logic itself is
    exercised, rather than being mocked out wholesale."""
    def _stub(table, params, strict=False):
        if table == "football_players":
            return players or []
        if table == "football_sessions":
            return sessions or []
        if table == "football_org_members":
            return members or []
        return []
    return _stub


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
            mock_select.side_effect = _select_stub(sessions=[_open_session_row("sess-9", "player-9")])
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
