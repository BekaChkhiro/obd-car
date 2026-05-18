from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.db import Base, get_session
from app.main import app


@pytest.fixture()
def ws_client(tmp_path):
    """Sync TestClient backed by an isolated file-based SQLite for WebSocket tests."""
    db_file = tmp_path / "ws.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", future=True)
    sf = async_sessionmaker(engine, expire_on_commit=False)

    async def _setup() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_setup())

    async def _override():
        async with sf() as s:
            yield s

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

    async def _teardown() -> None:
        await engine.dispose()

    asyncio.run(_teardown())


def _register(client: TestClient, email: str) -> str:
    resp = client.post(
        "/auth/register", json={"email": email, "password": "supersecret1", "locale": "en"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["tokens"]["access_token"]


# ── happy-path ────────────────────────────────────────────────────────────────


def test_ws_auth_via_query_token(ws_client):
    token = _register(ws_client, "a@test.com")
    with ws_client.websocket_connect(f"/ws/session/sess-q?token={token}") as ws:
        ws.send_json(
            {
                "type": "register",
                "supported_pids": ["0x0C", "0x0D"],
                "vin": "1HGCM82633A123456",
                "locale": "en",
            }
        )
        data = ws.receive_json()
    assert data["type"] == "registered"
    assert data["session_id"] == "sess-q"
    assert isinstance(data["user_id"], int)


def test_ws_auth_via_first_frame(ws_client):
    token = _register(ws_client, "b@test.com")
    with ws_client.websocket_connect("/ws/session/sess-f") as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.send_json({"type": "register", "supported_pids": [], "vin": None, "locale": "ka"})
        data = ws.receive_json()
    assert data["type"] == "registered"
    assert data["session_id"] == "sess-f"


def test_ws_ack_messages_in_loop(ws_client):
    token = _register(ws_client, "c@test.com")
    with ws_client.websocket_connect(f"/ws/session/sess-ack?token={token}") as ws:
        ws.send_json({"type": "register", "supported_pids": [], "locale": "en"})
        ws.receive_json()  # "registered"
        ws.send_json({"type": "obd_data", "pid": "0x0C", "value": 3000})
        ack = ws.receive_json()
    assert ack["type"] == "ack"
    assert ack["received"] == "obd_data"


# ── auth rejection ─────────────────────────────────────────────────────────────


def test_ws_rejects_invalid_query_token(ws_client):
    with ws_client.websocket_connect("/ws/session/sess-bad-q?token=not-a-jwt") as ws:
        data = ws.receive_json()
    assert data["type"] == "error"
    assert data["code"] == "unauthorized"


def test_ws_rejects_wrong_first_frame_type(ws_client):
    with ws_client.websocket_connect("/ws/session/sess-bad-f") as ws:
        # Send register directly without auth — server expects auth frame first.
        ws.send_json({"type": "register", "supported_pids": []})
        data = ws.receive_json()
    assert data["type"] == "error"
    assert data["code"] == "unauthorized"


def test_ws_rejects_invalid_auth_frame_token(ws_client):
    with ws_client.websocket_connect("/ws/session/sess-bad-t") as ws:
        ws.send_json({"type": "auth", "token": "not-a-valid-jwt"})
        data = ws.receive_json()
    assert data["type"] == "error"
    assert data["code"] == "unauthorized"


def test_ws_rejects_missing_token_field_in_auth_frame(ws_client):
    with ws_client.websocket_connect("/ws/session/sess-no-tok") as ws:
        ws.send_json({"type": "auth"})  # missing token field
        data = ws.receive_json()
    assert data["type"] == "error"
    assert data["code"] == "unauthorized"


# ── protocol rejection ─────────────────────────────────────────────────────────


def test_ws_rejects_wrong_second_frame(ws_client):
    token = _register(ws_client, "d@test.com")
    with ws_client.websocket_connect(f"/ws/session/sess-bad-reg?token={token}") as ws:
        ws.send_json({"type": "obd_data", "pid": "0x0C"})  # not "register"
        data = ws.receive_json()
    assert data["type"] == "error"
    assert data["code"] == "bad_protocol"
