"""
Unit tests for backend/server.py. No real network calls are made -- every
Supabase request (requests.get/post/patch) is mocked, so these run fast
and don't need real credentials or a live database.
"""
import sys
import os
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
    server.device_active_session.clear()
    server.SUPABASE_URL = "https://fake-project.supabase.co"
    server.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key"
    yield
    server.device_state.clear()
    server.device_active_session.clear()


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
        server.ingest_reading("dev-1", {"speed": "10", "shot": "kick"})
        mock_post.assert_not_called()

    @patch("server.requests.post")
    def test_persists_real_kick_with_active_session(self, mock_post):
        mock_post.return_value = _fake_response()
        server.device_active_session["dev-1"] = {"session_id": "s1", "player_id": "p1"}

        server.ingest_reading("dev-1", {"speed": "10", "spin": "20", "force": "30", "distance": "40", "shot": "kick"})

        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        assert kwargs["json"]["player_id"] == "p1"
        assert kwargs["json"]["device_id"] == "dev-1"

    def test_idle_reading_not_persisted_even_with_session(self):
        with patch("server.requests.post") as mock_post:
            server.device_active_session["dev-1"] = {"session_id": "s1", "player_id": "p1"}
            server.ingest_reading("dev-1", {"speed": "0", "shot": "Kick Not Detected"})
            mock_post.assert_not_called()

    def test_legacy_device_id_writes_null_device_id(self):
        with patch("server.requests.post") as mock_post:
            mock_post.return_value = _fake_response()
            server.device_active_session[server.LEGACY_DEVICE_ID] = {"session_id": "s1", "player_id": "p1"}
            server.ingest_reading(server.LEGACY_DEVICE_ID, {"speed": "5", "shot": "kick"})
            _, kwargs = mock_post.call_args
            assert kwargs["json"]["device_id"] is None


# ==========================================
# Flask routes
# ==========================================

class TestRoutes:
    def test_healthz(self, client):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"

    def test_data_endpoint_unknown_device_reports_disconnected(self, client):
        resp = client.get("/data?device_id=never-seen")
        body = resp.get_json()
        assert body["connected"] is False

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
