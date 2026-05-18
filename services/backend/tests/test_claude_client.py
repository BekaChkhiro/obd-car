from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.claude import (
    DEFAULT_MODEL,
    SHORT_CLARIFICATION_MODEL,
    ClaudeClient,
    ClaudeModel,
    apply_cache_breakpoint,
    cache_breakpoint_text,
    mark_last_block_cached,
    route_model,
)

# ── models / routing ──────────────────────────────────────────────────────────


def test_default_model_is_sonnet_4_6():
    assert DEFAULT_MODEL == "claude-sonnet-4-6"
    assert ClaudeModel.SONNET_4_6.value == DEFAULT_MODEL


def test_short_clarification_routes_to_haiku():
    assert SHORT_CLARIFICATION_MODEL == "claude-haiku-4-5-20251001"
    assert route_model(short_clarification=True) == SHORT_CLARIFICATION_MODEL


def test_route_default_is_sonnet():
    assert route_model() == DEFAULT_MODEL
    assert route_model(short_clarification=False) == DEFAULT_MODEL


# ── cache helpers ─────────────────────────────────────────────────────────────


def test_cache_breakpoint_text_marks_block():
    block = cache_breakpoint_text("stable system intro")
    assert block == {
        "type": "text",
        "text": "stable system intro",
        "cache_control": {"type": "ephemeral"},
    }


def test_apply_cache_breakpoint_preserves_block_fields():
    tool = {"name": "read_pid", "input_schema": {"type": "object"}}
    out = apply_cache_breakpoint(tool)
    assert out["name"] == "read_pid"
    assert out["input_schema"] == {"type": "object"}
    assert out["cache_control"] == {"type": "ephemeral"}
    # Original is not mutated.
    assert "cache_control" not in tool


def test_mark_last_block_cached_only_marks_last():
    blocks = [
        {"type": "text", "text": "first"},
        {"type": "text", "text": "second"},
        {"type": "text", "text": "third"},
    ]
    out = mark_last_block_cached(blocks)
    assert "cache_control" not in out[0]
    assert "cache_control" not in out[1]
    assert out[2]["cache_control"] == {"type": "ephemeral"}
    # Source list is not mutated.
    assert all("cache_control" not in b for b in blocks)


def test_mark_last_block_cached_handles_empty():
    assert mark_last_block_cached([]) == []


# ── streaming client ──────────────────────────────────────────────────────────


class _FakeStream:
    """Async context manager + async iterator that yields canned events."""

    def __init__(self, events: list[Any]) -> None:
        self._events = events
        self.entered = False
        self.exited = False

    async def __aenter__(self) -> _FakeStream:
        self.entered = True
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        self.exited = True

    def __aiter__(self):
        async def gen():
            for e in self._events:
                yield e

        return gen()


def _fake_anthropic(events: list[Any]) -> tuple[Any, dict[str, Any]]:
    """Build a stand-in AsyncAnthropic whose `.messages.stream(**kw)` returns `_FakeStream`.

    Returns (mock_client, captured_kwargs_dict). The dict gets the kwargs of the
    last `stream()` call mutated into it.
    """
    captured: dict[str, Any] = {}
    fake_stream = _FakeStream(events)

    def stream(**kwargs: Any) -> _FakeStream:
        captured.clear()
        captured.update(kwargs)
        return fake_stream

    messages = MagicMock()
    messages.stream = stream
    client = MagicMock()
    client.messages = messages
    return client, captured


@pytest.mark.asyncio
async def test_stream_forwards_request_and_yields_events():
    events = ["start", "delta-1", "delta-2", "stop"]
    fake, captured = _fake_anthropic(events)
    cc = ClaudeClient(client=fake)

    received: list[Any] = []
    async with cc.stream(
        messages=[{"role": "user", "content": "hello"}],
        system="you are a helpful diagnostic assistant",
        tools=[{"name": "read_pid", "input_schema": {"type": "object"}}],
    ) as s:
        async for evt in s:
            received.append(evt)

    assert received == events
    assert captured["model"] == DEFAULT_MODEL
    assert captured["max_tokens"] == 4096
    assert captured["messages"] == [{"role": "user", "content": "hello"}]
    assert captured["system"] == "you are a helpful diagnostic assistant"
    assert captured["tools"][0]["name"] == "read_pid"


@pytest.mark.asyncio
async def test_stream_routes_short_clarification_to_haiku():
    fake, captured = _fake_anthropic([])
    cc = ClaudeClient(client=fake)

    async with cc.stream(
        messages=[{"role": "user", "content": "yes or no?"}],
        short_clarification=True,
    ):
        pass

    assert captured["model"] == SHORT_CLARIFICATION_MODEL


@pytest.mark.asyncio
async def test_stream_explicit_model_overrides_routing():
    fake, captured = _fake_anthropic([])
    cc = ClaudeClient(client=fake)

    async with cc.stream(
        messages=[{"role": "user", "content": "hi"}],
        model="claude-opus-4-7",
        short_clarification=True,  # should be ignored when model is explicit
    ):
        pass

    assert captured["model"] == "claude-opus-4-7"


@pytest.mark.asyncio
async def test_stream_omits_tools_when_none():
    fake, captured = _fake_anthropic([])
    cc = ClaudeClient(client=fake)

    async with cc.stream(messages=[{"role": "user", "content": "hi"}]):
        pass

    assert "tools" not in captured
    assert "system" not in captured


@pytest.mark.asyncio
async def test_stream_passes_extra_headers():
    fake, captured = _fake_anthropic([])
    cc = ClaudeClient(client=fake)

    async with cc.stream(
        messages=[{"role": "user", "content": "hi"}],
        extra_headers={"anthropic-beta": "some-beta-flag"},
    ):
        pass

    assert captured["extra_headers"] == {"anthropic-beta": "some-beta-flag"}


def test_pick_model_helpers():
    cc = ClaudeClient(client=MagicMock())
    assert cc.pick_model() == DEFAULT_MODEL
    assert cc.pick_model(short_clarification=True) == SHORT_CLARIFICATION_MODEL
    assert cc.default_model == DEFAULT_MODEL


def test_client_constructor_uses_injected_client():
    sentinel = MagicMock(name="injected-client")
    cc = ClaudeClient(client=sentinel)
    assert cc._client is sentinel


def test_client_constructor_builds_anthropic_when_no_client(monkeypatch):
    """Smoke-test: with no client injected, AsyncAnthropic is instantiated with the API key."""
    from app.claude import client as client_mod

    seen: dict[str, Any] = {}

    def fake_ctor(api_key: str | None = None, **kwargs: Any) -> Any:
        seen["api_key"] = api_key
        return AsyncMock(name="anthropic-instance")

    monkeypatch.setattr(client_mod, "AsyncAnthropic", fake_ctor)
    ClaudeClient(api_key="sk-ant-test")
    assert seen["api_key"] == "sk-ant-test"
