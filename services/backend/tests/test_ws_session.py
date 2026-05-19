from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

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


# ── chat streaming + resume ────────────────────────────────────────────────────


@dataclass
class _FakeTextDelta:
    text: str
    type: str = "text_delta"


@dataclass
class _FakeContentBlockDeltaEvent:
    delta: _FakeTextDelta
    index: int = 0
    type: str = "content_block_delta"


@dataclass
class _FakeMessage:
    content: list[Any]
    stop_reason: str = "end_turn"


@dataclass
class _FakeStream:
    events: list[Any]
    final: _FakeMessage

    async def __aenter__(self) -> _FakeStream:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    def __aiter__(self):
        async def gen():
            for e in self.events:
                yield e

        return gen()

    async def get_final_message(self) -> _FakeMessage:
        return self.final


@dataclass
class _FakeClaudeClient:
    """Stand-in for ClaudeClient.stream(...) used in WS chat tests."""

    streams: list[_FakeStream] = field(default_factory=list)
    default_model: str = "claude-sonnet-4-6"

    def pick_model(self, *, short_clarification: bool = False) -> str:
        return self.default_model

    def stream(self, **_kwargs: Any) -> _FakeStream:
        if not self.streams:
            raise AssertionError("FakeClaudeClient ran out of queued streams")
        return self.streams.pop(0)


def _install_fake_claude(streams: list[_FakeStream]) -> _FakeClaudeClient:
    fake = _FakeClaudeClient(streams=streams)
    app.state.claude_client = fake
    return fake


def _clear_fake_claude() -> None:
    if hasattr(app.state, "claude_client"):
        delattr(app.state, "claude_client")


def _register_session(ws, token: str, session_id: str) -> dict:
    ws.send_json({"type": "register", "supported_pids": [], "locale": "en"})
    msg = ws.receive_json()
    assert msg["type"] == "registered"
    return msg


def test_ws_streams_assistant_turn(ws_client):
    token = _register(ws_client, "chat1@test.com")
    streams = [
        _FakeStream(
            events=[
                _FakeContentBlockDeltaEvent(_FakeTextDelta("Hello ")),
                _FakeContentBlockDeltaEvent(_FakeTextDelta("there!")),
            ],
            final=_FakeMessage(
                content=[{"type": "text", "text": "Hello there!"}],
                stop_reason="end_turn",
            ),
        )
    ]
    _install_fake_claude(streams)
    try:
        with ws_client.websocket_connect(
            f"/ws/session/sess-chat-1?token={token}"
        ) as ws:
            _register_session(ws, token, "sess-chat-1")
            ws.send_json(
                {"type": "user_message", "id": "msg-u-1", "content": "hi"}
            )

            frames: list[dict] = []
            while True:
                f = ws.receive_json()
                frames.append(f)
                if f["type"] == "turn_complete":
                    break
    finally:
        _clear_fake_claude()

    types = [f["type"] for f in frames]
    assert types == [
        "assistant_message_start",
        "text_delta",
        "text_delta",
        "assistant_message_end",
        "turn_complete",
    ]
    # Sequence numbers must be strictly monotonic across the whole frame log.
    seqs = [f["seq"] for f in frames]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == len(seqs)
    text_frames = [f for f in frames if f["type"] == "text_delta"]
    assert "".join(t["text"] for t in text_frames) == "Hello there!"
    assert frames[-1]["stop_reason"] == "end_turn"


def test_ws_resume_replays_frames_since_last_seq(ws_client):
    token = _register(ws_client, "chat2@test.com")
    streams = [
        _FakeStream(
            events=[
                _FakeContentBlockDeltaEvent(_FakeTextDelta("Part-A ")),
                _FakeContentBlockDeltaEvent(_FakeTextDelta("Part-B")),
            ],
            final=_FakeMessage(
                content=[{"type": "text", "text": "Part-A Part-B"}],
                stop_reason="end_turn",
            ),
        )
    ]
    _install_fake_claude(streams)
    try:
        with ws_client.websocket_connect(
            f"/ws/session/sess-chat-2?token={token}"
        ) as ws:
            registered = _register_session(ws, token, "sess-chat-2")
            register_seq = registered["seq"]

            ws.send_json(
                {"type": "user_message", "id": "msg-u-2", "content": "ping"}
            )
            received: list[dict] = []
            while True:
                f = ws.receive_json()
                received.append(f)
                if f["type"] == "turn_complete":
                    break

            # Mid-stream resume from the seq just before the first text_delta —
            # we should get every frame after that point back.
            first_delta = next(f for f in received if f["type"] == "text_delta")
            replay_from = first_delta["seq"] - 1

            ws.send_json({"type": "resume", "last_seq": replay_from})
            replayed: list[dict] = []
            while True:
                f = ws.receive_json()
                replayed.append(f)
                if f["type"] == "replay_complete":
                    break
    finally:
        _clear_fake_claude()

    # The replay should include every original frame with seq > replay_from
    # (not the very first registered frame).
    original_after = [f for f in received if f["seq"] > replay_from]
    # Replay terminates with a synthetic replay_complete frame (newly seqed).
    assert replayed[-1]["type"] == "replay_complete"
    assert [f["seq"] for f in replayed[:-1]] == [f["seq"] for f in original_after]
    assert [f["type"] for f in replayed[:-1]] == [f["type"] for f in original_after]
    # The synthetic replay_complete carries a brand-new seq, strictly greater
    # than any previously emitted frame.
    assert replayed[-1]["seq"] > received[-1]["seq"]
    assert register_seq < replay_from


def test_ws_rejects_empty_user_message(ws_client):
    token = _register(ws_client, "chat3@test.com")
    with ws_client.websocket_connect(
        f"/ws/session/sess-chat-3?token={token}"
    ) as ws:
        _register_session(ws, token, "sess-chat-3")
        ws.send_json({"type": "user_message", "id": "x", "content": "   "})
        err = ws.receive_json()
    assert err["type"] == "error"
    assert err["code"] == "bad_message"


def test_ws_confirm_write_acks_and_ignores_unknown_name(ws_client):
    """confirm_write frame is acked; an empty/missing name is silently ignored."""
    token = _register(ws_client, "cw1@test.com")
    with ws_client.websocket_connect(f"/ws/session/sess-cw-1?token={token}") as ws:
        _register_session(ws, token, "sess-cw-1")

        ws.send_json({"type": "confirm_write", "name": "clear_dtcs"})
        ack = ws.receive_json()
        assert ack["type"] == "ack"
        assert ack["received"] == "confirm_write"

        # Empty name should still ack without crashing.
        ws.send_json({"type": "confirm_write", "name": ""})
        ack2 = ws.receive_json()
        assert ack2["type"] == "ack"
        assert ack2["received"] == "confirm_write"

        # Session loop is still alive.
        ws.send_json({"type": "obd_data", "pid": "0x0C"})
        alive = ws.receive_json()
    assert alive["type"] == "ack"
    assert alive["received"] == "obd_data"


def test_ws_tool_result_with_no_waiter_is_logged_not_fatal(ws_client):
    """A stray tool_result frame should not tear down the session."""
    token = _register(ws_client, "chat4@test.com")
    with ws_client.websocket_connect(
        f"/ws/session/sess-chat-4?token={token}"
    ) as ws:
        _register_session(ws, token, "sess-chat-4")
        ws.send_json(
            {
                "type": "tool_result",
                "tool_use_id": "no-such-call",
                "content": {"rpm": 1200},
            }
        )
        # Round-trip a benign frame to confirm the loop is still alive.
        ws.send_json({"type": "obd_data", "pid": "0x0C"})
        ack = ws.receive_json()
    assert ack["type"] == "ack"
    assert ack["received"] == "obd_data"
