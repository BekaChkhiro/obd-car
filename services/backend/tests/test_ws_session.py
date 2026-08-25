from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.db import Base, get_session
from app.main import app
from app.ws import routes

_CODE_RE = re.compile(r"code is (\d{4})")


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


def _phone_from_seed(seed: str) -> str:
    """A distinct, deterministic Georgian mobile number per test identifier.

    These tests only need distinct accounts, not real seeds — reusing the
    old email-address literals as the seed keeps every call site unchanged.
    """
    digits = str(int(hashlib.sha1(seed.encode()).hexdigest(), 16))[-8:].zfill(8)
    return f"+9955{digits}"


def _register(client: TestClient, email: str) -> str:
    phone = _phone_from_seed(email)
    captured: list[str] = []

    async def fake_send(*, to: str, text: str) -> None:
        captured.append(_CODE_RE.search(text).group(1))

    with patch("app.auth.routes.send_sms", fake_send):
        resp = client.post(
            "/auth/request-code",
            json={"phone": phone, "first_name": "WS", "last_name": "Tester"},
        )
        assert resp.status_code == 200, resp.text
        resp = client.post("/auth/verify-code", json={"phone": phone, "code": captured[-1]})
    assert resp.status_code == 200, resp.text
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


# ── live-data grounding + tool bridge ─────────────────────────────────────────
#
# These cover the contract that keeps the assistant honest: the phone tells the
# backend whether it actually holds an OBD-II link, the backend puts that in the
# system prompt, and every vehicle number reaching the model comes back over the
# tool bridge rather than out of the model's head.


class _RecordingClaudeClient(_FakeClaudeClient):
    """`_FakeClaudeClient` that keeps the kwargs of every `stream(...)` call.

    Plain `__init__` rather than `__post_init__`: the base dataclass was
    generated without a post-init hook, so one added here would never run and
    `self.calls` would not exist by the time `stream(...)` is called.
    """

    def __init__(self, streams: list[_FakeStream]) -> None:
        super().__init__(streams=streams)
        self.calls: list[dict[str, Any]] = []

    def stream(self, **kwargs: Any) -> _FakeStream:
        self.calls.append(kwargs)
        return super().stream(**kwargs)



def _fake_resolve_make(make: str | None):
    """Stub the VIN decoder — these tests are about plumbing, not about NHTSA."""

    async def _resolve(_vin: str | None) -> str | None:
        return make

    return _resolve


def _text_stream(text: str) -> _FakeStream:
    return _FakeStream(
        events=[_FakeContentBlockDeltaEvent(_FakeTextDelta(text))],
        final=_FakeMessage(content=[{"type": "text", "text": text}], stop_reason="end_turn"),
    )


def _system_text(call: dict[str, Any]) -> str:
    """Flatten the system blocks of one recorded stream(...) call."""
    return "\n".join(block["text"] for block in call["system"])


def _drain_turn(ws) -> list[dict]:
    frames: list[dict] = []
    while True:
        f = ws.receive_json()
        frames.append(f)
        if f["type"] == "turn_complete":
            return frames


def test_ws_system_prompt_says_unavailable_when_adapter_disconnected(ws_client):
    """A phone with no adapter must not leave the model guessing that it has one."""
    token = _register(ws_client, "ground1@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g1?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": [],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": False,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "what is my rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    system = _system_text(fake.calls[0])
    assert "Live vehicle data: UNAVAILABLE" in system
    assert "Live vehicle data: AVAILABLE" not in system
    # The anti-fabrication contract travels with every turn, connected or not.
    assert "Data grounding rules" in system


def test_ws_system_prompt_lists_discovered_pids_when_connected(ws_client):
    token = _register(ws_client, "ground2@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g2?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C", "010D"],
                    "vin": "1HGCM82633A123456",
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    system = _system_text(fake.calls[0])
    assert "Live vehicle data: AVAILABLE" in system
    assert "010C, 010D" in system


def test_ws_adapter_status_flips_prompt_mid_session(ws_client):
    """The adapter dropping mid-conversation must reach the very next turn."""
    token = _register(ws_client, "ground3@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("first"), _text_stream("second")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g3?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"

            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)

            ws.send_json(
                {"type": "adapter_status", "connected": False, "supported_pids": [], "vin": None}
            )
            ack = ws.receive_json()
            assert ack == {**ack, "type": "ack", "received": "adapter_status"}

            ws.send_json({"type": "user_message", "id": "m2", "content": "and now?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    first, second = _system_text(fake.calls[0]), _system_text(fake.calls[1])
    assert "Live vehicle data: AVAILABLE" in first
    assert "Live vehicle data: UNAVAILABLE" in second
    # The PID list must not outlive the link that verified it.
    assert "010C" in first
    assert "010C" not in second


def test_ws_register_without_adapter_flag_falls_back_to_pid_list(ws_client):
    """Older clients only populated supported_pids when they had a live adapter."""
    token = _register(ws_client, "ground4@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g4?token={token}") as ws:
            ws.send_json(
                {"type": "register", "supported_pids": ["010C"], "vin": None, "locale": "en"}
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    assert "Live vehicle data: AVAILABLE" in _system_text(fake.calls[0])


def test_ws_register_with_simulated_adapter_marks_the_prompt_simulated(ws_client):
    """Demo mode reads the car, but the model must know the car is a simulator."""
    token = _register(ws_client, "ground5@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g5?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                    "adapter_simulated": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    system = _system_text(fake.calls[0])
    assert "Live vehicle data: SIMULATED" in system
    # Reading is still on the table — a demo that cannot read shows nothing.
    assert "Live vehicle data: UNAVAILABLE" not in system
    assert "010C" in system


def test_ws_register_without_simulated_flag_assumes_a_real_adapter(ws_client):
    """Guessing 'simulated' would have the assistant disown genuine readings."""
    token = _register(ws_client, "ground6@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g6?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    assert "Live vehicle data: AVAILABLE" in _system_text(fake.calls[0])


def test_ws_adapter_status_can_switch_a_real_link_to_simulated(ws_client):
    """Swapping a dongle for the demo mock mid-session must reach the next turn."""
    token = _register(ws_client, "ground7@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("first"), _text_stream("second")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g7?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                    "adapter_simulated": False,
                }
            )
            assert ws.receive_json()["type"] == "registered"

            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)

            ws.send_json(
                {
                    "type": "adapter_status",
                    "connected": True,
                    "simulated": True,
                    "supported_pids": ["010C"],
                    "vin": None,
                }
            )
            ack = ws.receive_json()
            assert ack == {**ack, "type": "ack", "received": "adapter_status"}

            ws.send_json({"type": "user_message", "id": "m2", "content": "and now?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    first, second = _system_text(fake.calls[0]), _system_text(fake.calls[1])
    assert "Live vehicle data: AVAILABLE" in first
    assert "Live vehicle data: SIMULATED" in second


def test_ws_adapter_status_drops_the_simulated_flag_with_the_link(ws_client):
    """A dropped link is not a simulated one — it is no link at all."""
    token = _register(ws_client, "ground8@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("first"), _text_stream("second")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-g8?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                    "adapter_simulated": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"

            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)

            ws.send_json({"type": "adapter_status", "connected": False, "simulated": True})
            assert ws.receive_json()["received"] == "adapter_status"

            ws.send_json({"type": "user_message", "id": "m2", "content": "and now?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    first, second = _system_text(fake.calls[0]), _system_text(fake.calls[1])
    assert "Live vehicle data: SIMULATED" in first
    assert "Live vehicle data: UNAVAILABLE" in second
    assert "SIMULATED" not in second


def test_ws_tool_bridge_round_trip_reaches_the_phone_and_back(ws_client):
    """End-to-end tool bridge: model asks, phone answers, model sees the answer.

    This is the path every vehicle number takes. If it breaks, the model has
    nothing to ground on — so the assertion is not just "a frame arrived" but
    that the phone's exact payload came back into the next request's messages.
    """
    token = _register(ws_client, "bridge1@test.com")
    tool_stream = _FakeStream(
        events=[_FakeContentBlockDeltaEvent(_FakeTextDelta("Reading RPM…"))],
        final=_FakeMessage(
            content=[
                {"type": "text", "text": "Reading RPM…"},
                {
                    "type": "tool_use",
                    "id": "tu_rpm",
                    "name": "read_pid",
                    "input": {"pid": "010C"},
                },
            ],
            stop_reason="tool_use",
        ),
    )
    fake = _RecordingClaudeClient(streams=[tool_stream, _text_stream("Engine is at 3210 rpm.")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-bridge?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "what is my rpm?"})

            frames: list[dict] = []
            while True:
                f = ws.receive_json()
                frames.append(f)
                if f["type"] == "tool_call":
                    # The phone side: run the BLE command and answer.
                    ws.send_json(
                        {
                            "type": "tool_result",
                            "tool_use_id": f["tool_use_id"],
                            "content": {"value": 3210, "unit": "rpm"},
                        }
                    )
                if f["type"] == "turn_complete":
                    break
    finally:
        _clear_fake_claude()

    by_type = [f["type"] for f in frames]
    assert "tool_call" in by_type
    assert "tool_call_completed" in by_type

    call = next(f for f in frames if f["type"] == "tool_call")
    assert call["name"] == "read_pid"
    assert call["input"] == {"pid": "010C"}
    assert call["tool_use_id"] == "tu_rpm"

    # The second request to the model carries the phone's reading verbatim.
    follow_up = fake.calls[1]["messages"]
    tool_results = [
        block
        for msg in follow_up
        if isinstance(msg.get("content"), list)
        for block in msg["content"]
        if isinstance(block, dict) and block.get("type") == "tool_result"
    ]
    assert len(tool_results) == 1
    assert tool_results[0]["tool_use_id"] == "tu_rpm"
    assert "3210" in tool_results[0]["content"]


def test_ws_tool_bridge_reports_phone_side_failure_instead_of_swallowing_it(ws_client):
    """A failed read must reach the model as an error, never as a missing result."""
    token = _register(ws_client, "bridge2@test.com")
    tool_stream = _FakeStream(
        events=[],
        final=_FakeMessage(
            content=[
                {"type": "tool_use", "id": "tu_fail", "name": "read_pid", "input": {"pid": "010C"}}
            ],
            stop_reason="tool_use",
        ),
    )
    fake = _RecordingClaudeClient(
        streams=[tool_stream, _text_stream("I could not read the engine RPM.")]
    )
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-bridge2?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})

            while True:
                f = ws.receive_json()
                if f["type"] == "tool_call":
                    ws.send_json(
                        {
                            "type": "tool_result",
                            "tool_use_id": f["tool_use_id"],
                            "content": "NO DATA — adapter did not respond",
                            "is_error": True,
                        }
                    )
                if f["type"] == "turn_complete":
                    break
    finally:
        _clear_fake_claude()

    follow_up = fake.calls[1]["messages"]
    tool_results = [
        block
        for msg in follow_up
        if isinstance(msg.get("content"), list)
        for block in msg["content"]
        if isinstance(block, dict) and block.get("type") == "tool_result"
    ]
    assert len(tool_results) == 1
    assert tool_results[0].get("is_error") is True
    assert "NO DATA" in tool_results[0]["content"]


def test_ws_turn_hands_the_model_the_obd_tool_catalogue(ws_client):
    """No tools reaching the model is how fabricated readings get in.

    Without a catalogue Claude cannot request a reading, and the observed
    failure is not a refusal — it narrates a tool call in plain text and
    invents the result.
    """
    from app.claude import OBD_TOOL_NAMES

    token = _register(ws_client, "tools1@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-tools?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "rpm?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    tools = fake.calls[0]["tools"]
    assert tools, "the model was given no tools at all"
    names = {t["name"] for t in tools}
    # Every phone-executed tool must be offered; web_search rides along as the
    # one server-side tool, so the catalogue is a superset, not an exact match.
    assert set(OBD_TOOL_NAMES) <= names
    assert names == set(OBD_TOOL_NAMES) | {"web_search"}


def test_ws_turn_offers_web_search_restricted_to_automotive_domains(ws_client):
    """Search is what makes manufacturer-specific codes answerable.

    The allowlist is the topic restriction: an unrestricted search tool would
    let the assistant answer anything, and a search tool that never reaches the
    model leaves it guessing which make a P1xxx belongs to.
    """
    from app.claude import AUTOMOTIVE_SEARCH_DOMAINS

    token = _register(ws_client, "websearch1@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("ok")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-search?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": None,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "what is P1133?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    tools = fake.calls[0]["tools"]
    search = next(t for t in tools if t.get("name") == "web_search")
    assert search["type"].startswith("web_search_")
    assert search["allowed_domains"] == AUTOMOTIVE_SEARCH_DOMAINS
    # The API rejects a request carrying both lists.
    assert "blocked_domains" not in search
    assert search["max_uses"] >= 1
    # A general-purpose domain would turn the topic restriction into no
    # restriction at all — anything can be researched through one.
    for general in ("wikipedia.org", "reddit.com", "google.com", "youtube.com", "x.com"):
        assert general not in AUTOMOTIVE_SEARCH_DOMAINS


def test_ws_back_to_back_messages_are_not_refused_as_busy(ws_client):
    """`turn_complete` renders on the phone before the turn's last DB write.

    A user who replies the instant the answer appears must not have their
    message bounced with `busy`.
    """
    token = _register(ws_client, "busy1@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("first"), _text_stream("second")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-busy?token={token}") as ws:
            ws.send_json(
                {"type": "register", "supported_pids": [], "vin": None, "locale": "en"}
            )
            assert ws.receive_json()["type"] == "registered"

            ws.send_json({"type": "user_message", "id": "m1", "content": "first?"})
            _drain_turn(ws)
            # No pause: send again the moment turn_complete lands.
            ws.send_json({"type": "user_message", "id": "m2", "content": "second?"})
            frames = _drain_turn(ws)
    finally:
        _clear_fake_claude()

    assert [f for f in frames if f["type"] == "error"] == []
    assert "".join(f["text"] for f in frames if f["type"] == "text_delta") == "second"


def test_ws_duplicate_message_id_is_refused_without_killing_the_session(ws_client):
    """A resent message id used to raise IntegrityError and drop the socket."""
    token = _register(ws_client, "dup1@test.com")
    fake = _RecordingClaudeClient(streams=[_text_stream("first")])
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-dup?token={token}") as ws:
            ws.send_json(
                {"type": "register", "supported_pids": [], "vin": None, "locale": "en"}
            )
            assert ws.receive_json()["type"] == "registered"

            ws.send_json({"type": "user_message", "id": "dup", "content": "hello"})
            _drain_turn(ws)

            ws.send_json({"type": "user_message", "id": "dup", "content": "hello again"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert err["code"] == "duplicate_message"

            # The session survives — a fresh id still works.
            ws.send_json({"type": "obd_data", "pid": "0x0C"})
            alive = ws.receive_json()
    finally:
        _clear_fake_claude()

    assert alive["type"] == "ack"
    # The refused frame must not have entered the model's transcript. (The list
    # is the live one the dispatcher appends to, so it also holds the reply.)
    user_turns = [
        m["content"] for m in fake.calls[0]["messages"] if m["role"] == "user"
    ]
    assert user_turns == ["hello"]


# ── DTC definitions and the decoded make ─────────────────────────────────────


def _dtc_tool_stream(tool_use_id: str = "tu_dtc") -> _FakeStream:
    return _FakeStream(
        events=[],
        final=_FakeMessage(
            content=[
                {
                    "type": "tool_use",
                    "id": tool_use_id,
                    "name": "read_dtcs",
                    "input": {},
                },
            ],
            stop_reason="tool_use",
        ),
    )


def _run_dtc_turn(ws_client, *, email: str, session: str, vin: str | None, codes: list[str]):
    """Drive one read_dtcs round-trip and hand back the recorded stream calls."""
    token = _register(ws_client, email)
    fake = _RecordingClaudeClient(
        streams=[_dtc_tool_stream(), _text_stream("ok"), _text_stream("second turn")]
    )
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/{session}?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": vin,
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "any codes?"})

            while True:
                f = ws.receive_json()
                if f["type"] == "tool_call":
                    ws.send_json(
                        {
                            "type": "tool_result",
                            "tool_use_id": f["tool_use_id"],
                            "content": {
                                "dtcs": [
                                    {"code": c, "description": None, "isPending": False}
                                    for c in codes
                                ]
                            },
                        }
                    )
                if f["type"] == "turn_complete":
                    break

            # A second turn: the codes are now known, so their definitions
            # should be in the prompt this time.
            ws.send_json({"type": "user_message", "id": "m2", "content": "explain them"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()
    return fake.calls


def test_ws_codes_read_from_the_ecu_reach_the_next_prompt(ws_client, monkeypatch):
    """Definitions are handed to the model, not recalled by it.

    Recall for a manufacturer-specific code is really a guess at which brand the
    number belongs to, and P1133 is four different faults across four makes.
    """
    monkeypatch.setattr(routes, "resolve_make", _fake_resolve_make("Ford"))

    calls = _run_dtc_turn(
        ws_client,
        email="dtcprompt1@test.com",
        session="sess-dtc-ford",
        vin="1FAHP2E80DG123456",
        codes=["P0420", "P1133"],
    )

    system = _system_text(calls[-1])
    assert "Catalyst System Efficiency Below Threshold Bank 1" in system
    assert "Bank 1 Fuel Control Shifted Lean" in system
    assert "definition for FORD" in system


def test_ws_without_a_decodable_vin_the_model_is_told_to_ask(ws_client, monkeypatch):
    monkeypatch.setattr(routes, "resolve_make", _fake_resolve_make(None))

    calls = _run_dtc_turn(
        ws_client,
        email="dtcprompt2@test.com",
        session="sess-dtc-nomake",
        vin=None,
        codes=["P1133"],
    )

    system = _system_text(calls[-1])
    assert "Bank 1 Fuel Control Shifted Lean" not in system
    assert "establish the make first" in system


def test_ws_definitions_stay_out_of_the_cached_prefix(ws_client, monkeypatch):
    """Per-vehicle codes in the cached block would break the prompt cache."""
    monkeypatch.setattr(routes, "resolve_make", _fake_resolve_make("Ford"))

    calls = _run_dtc_turn(
        ws_client,
        email="dtcprompt3@test.com",
        session="sess-dtc-cache",
        vin="1FAHP2E80DG123456",
        codes=["P1133"],
    )

    cached = [b for b in calls[-1]["system"] if b.get("cache_control")]
    assert cached, "expected a cached block"
    for block in cached:
        assert "Bank 1 Fuel Control Shifted Lean" not in block["text"]


def test_ws_losing_the_adapter_drops_the_remembered_codes(ws_client, monkeypatch):
    """The next car on this dongle is a different car."""
    monkeypatch.setattr(routes, "resolve_make", _fake_resolve_make("Ford"))
    token = _register(ws_client, "dtcdrop1@test.com")
    fake = _RecordingClaudeClient(
        streams=[_dtc_tool_stream(), _text_stream("ok"), _text_stream("after")]
    )
    app.state.claude_client = fake
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-dtc-drop?token={token}") as ws:
            ws.send_json(
                {
                    "type": "register",
                    "supported_pids": ["010C"],
                    "vin": "1FAHP2E80DG123456",
                    "locale": "en",
                    "adapter_connected": True,
                }
            )
            assert ws.receive_json()["type"] == "registered"
            ws.send_json({"type": "user_message", "id": "m1", "content": "codes?"})
            while True:
                f = ws.receive_json()
                if f["type"] == "tool_call":
                    ws.send_json(
                        {
                            "type": "tool_result",
                            "tool_use_id": f["tool_use_id"],
                            "content": {"dtcs": [{"code": "P1133", "isPending": False}]},
                        }
                    )
                if f["type"] == "turn_complete":
                    break

            ws.send_json(
                {"type": "adapter_status", "connected": False, "supported_pids": []}
            )
            assert ws.receive_json()["type"] == "ack"

            ws.send_json({"type": "user_message", "id": "m2", "content": "still there?"})
            _drain_turn(ws)
    finally:
        _clear_fake_claude()

    system = _system_text(fake.calls[-1])
    assert "P1133" not in system
