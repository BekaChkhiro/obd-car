"""Tests for T6.2: per-user AI rate limiting and per-session token budget."""
from __future__ import annotations

import asyncio
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import patch

import pytest
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
from starlette.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import rate_limit as rl_module
from app.auth.rate_limit import check_ai_rate_limit
from app.db import Base, get_session
from app.main import app

_CODE_RE = re.compile(r"code is (\d{4})")


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def ws_client(tmp_path):
    db_file = tmp_path / "rl.db"
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
            json={"phone": phone, "first_name": "RL", "last_name": "Tester"},
        )
        assert resp.status_code == 200, resp.text
        resp = client.post("/auth/verify-code", json={"phone": phone, "code": captured[-1]})
    assert resp.status_code == 200, resp.text
    return resp.json()["tokens"]["access_token"]


def _register_session(ws) -> dict:
    ws.send_json({"type": "register", "supported_pids": [], "locale": "en"})
    msg = ws.receive_json()
    assert msg["type"] == "registered"
    return msg


# ── Fake Claude helpers ───────────────────────────────────────────────────────


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
class _FakeUsage:
    input_tokens: int
    output_tokens: int


@dataclass
class _FakeMessage:
    content: list[Any]
    stop_reason: str = "end_turn"
    usage: _FakeUsage | None = None


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


def _text_stream(text: str = "ok", *, input_tokens: int = 0, output_tokens: int = 0) -> _FakeStream:
    usage = _FakeUsage(input_tokens=input_tokens, output_tokens=output_tokens) if (input_tokens or output_tokens) else None
    return _FakeStream(
        events=[_FakeContentBlockDeltaEvent(_FakeTextDelta(text))],
        final=_FakeMessage(
            content=[{"type": "text", "text": text}],
            stop_reason="end_turn",
            usage=usage,
        ),
    )


# ── Unit tests for check_ai_rate_limit ───────────────────────────────────────


def test_check_ai_rate_limit_allows_within_limit(monkeypatch):
    """Within the configured limit, the function returns True."""
    fresh_storage = MemoryStorage()
    fresh_limiter = MovingWindowRateLimiter(fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_storage", fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_limiter", fresh_limiter)
    monkeypatch.setattr(rl_module.settings, "ai_rate_limit", "5/minute")

    assert check_ai_rate_limit(user_id=1001) is True
    assert check_ai_rate_limit(user_id=1001) is True


def test_check_ai_rate_limit_blocks_after_limit_exceeded(monkeypatch):
    """After hitting the limit, subsequent calls return False."""
    fresh_storage = MemoryStorage()
    fresh_limiter = MovingWindowRateLimiter(fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_storage", fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_limiter", fresh_limiter)
    monkeypatch.setattr(rl_module.settings, "ai_rate_limit", "2/minute")

    assert check_ai_rate_limit(user_id=2001) is True   # 1st hit
    assert check_ai_rate_limit(user_id=2001) is True   # 2nd hit (at limit)
    assert check_ai_rate_limit(user_id=2001) is False  # 3rd hit (over limit)


def test_check_ai_rate_limit_isolates_users(monkeypatch):
    """Rate limit counters are per-user and do not bleed across users."""
    fresh_storage = MemoryStorage()
    fresh_limiter = MovingWindowRateLimiter(fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_storage", fresh_storage)
    monkeypatch.setattr(rl_module, "_ai_limiter", fresh_limiter)
    monkeypatch.setattr(rl_module.settings, "ai_rate_limit", "1/minute")

    assert check_ai_rate_limit(user_id=3001) is True   # user A first hit — OK
    assert check_ai_rate_limit(user_id=3001) is False  # user A second hit — blocked
    assert check_ai_rate_limit(user_id=3002) is True   # user B first hit — unaffected


# ── WebSocket integration: rate limit enforcement ─────────────────────────────


def test_ws_user_message_rejected_when_rate_limited(ws_client):
    """When the AI rate limiter returns False, user_message gets an error frame."""
    token = _register(ws_client, "rl1@test.com")
    with patch("app.ws.routes.check_ai_rate_limit", return_value=False):
        with ws_client.websocket_connect(f"/ws/session/sess-rl-1?token={token}") as ws:
            _register_session(ws)
            ws.send_json({"type": "user_message", "id": "m1", "content": "hello"})
            err = ws.receive_json()

    assert err["type"] == "error"
    assert err["code"] == "rate_limited"


def test_ws_user_message_allowed_when_rate_limit_passes(ws_client):
    """When the rate limiter returns True, the turn proceeds normally."""
    token = _register(ws_client, "rl2@test.com")
    streams = [_text_stream("hi")]
    _install_fake_claude(streams)
    try:
        with patch("app.ws.routes.check_ai_rate_limit", return_value=True):
            with ws_client.websocket_connect(f"/ws/session/sess-rl-2?token={token}") as ws:
                _register_session(ws)
                ws.send_json({"type": "user_message", "id": "m2", "content": "hello"})
                frames: list[dict] = []
                while True:
                    f = ws.receive_json()
                    frames.append(f)
                    if f["type"] == "turn_complete":
                        break
    finally:
        _clear_fake_claude()

    types = [f["type"] for f in frames]
    assert "turn_complete" in types
    assert not any(f["type"] == "error" and f.get("code") == "rate_limited" for f in frames)


# ── WebSocket integration: token budget enforcement ───────────────────────────


def test_ws_token_budget_blocks_turn_after_budget_exceeded(ws_client, monkeypatch):
    """After the session token budget is consumed, new turns are rejected."""
    monkeypatch.setattr("app.ws.routes.settings.session_token_budget", 100)

    token = _register(ws_client, "budget1@test.com")
    # First turn returns 60 input + 60 output = 120 tokens (> 100 budget)
    streams = [_text_stream("answer", input_tokens=60, output_tokens=60)]
    _install_fake_claude(streams)
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-bud-1?token={token}") as ws:
            _register_session(ws)

            # First turn — should proceed and exhaust the budget
            ws.send_json({"type": "user_message", "id": "m1", "content": "hello"})
            frames: list[dict] = []
            while True:
                f = ws.receive_json()
                frames.append(f)
                if f["type"] == "turn_complete":
                    break

            turn_complete = next(f for f in frames if f["type"] == "turn_complete")
            assert turn_complete["input_tokens"] == 60
            assert turn_complete["output_tokens"] == 60

            # Second turn — budget is now exceeded
            ws.send_json({"type": "user_message", "id": "m2", "content": "more"})
            err = ws.receive_json()
    finally:
        _clear_fake_claude()

    assert err["type"] == "error"
    assert err["code"] == "token_budget_exceeded"


def test_ws_token_budget_zero_means_unlimited(ws_client, monkeypatch):
    """When session_token_budget is 0 (default), no turns are blocked by budget."""
    monkeypatch.setattr("app.ws.routes.settings.session_token_budget", 0)

    token = _register(ws_client, "budget2@test.com")
    # Large usage that would exceed any finite budget — should not trigger an error.
    streams = [_text_stream("answer", input_tokens=5000, output_tokens=5000)]
    _install_fake_claude(streams)
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-bud-2?token={token}") as ws:
            _register_session(ws)
            ws.send_json({"type": "user_message", "id": "m1", "content": "hello"})
            frames: list[dict] = []
            while True:
                f = ws.receive_json()
                frames.append(f)
                if f["type"] == "turn_complete":
                    break
    finally:
        _clear_fake_claude()

    assert not any(
        f["type"] == "error" and f.get("code") == "token_budget_exceeded"
        for f in frames
    )
    turn = next(f for f in frames if f["type"] == "turn_complete")
    assert turn["input_tokens"] == 5000
    assert turn["output_tokens"] == 5000


def test_ws_turn_complete_includes_token_counts(ws_client):
    """turn_complete frame includes input_tokens and output_tokens from Claude."""
    token = _register(ws_client, "tokens1@test.com")
    streams = [_text_stream("resp", input_tokens=123, output_tokens=45)]
    _install_fake_claude(streams)
    try:
        with ws_client.websocket_connect(f"/ws/session/sess-tok-1?token={token}") as ws:
            _register_session(ws)
            ws.send_json({"type": "user_message", "id": "m1", "content": "hi"})
            frames: list[dict] = []
            while True:
                f = ws.receive_json()
                frames.append(f)
                if f["type"] == "turn_complete":
                    break
    finally:
        _clear_fake_claude()

    turn = next(f for f in frames if f["type"] == "turn_complete")
    assert turn["input_tokens"] == 123
    assert turn["output_tokens"] == 45
