"""Tests for ConversationContextManager (T3.8)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.claude.context import (
    ConversationContextManager,
    TokenUsage,
    build_messages_from_summary,
)


# ── TokenUsage ────────────────────────────────────────────────────────────────


def test_token_usage_total():
    u = TokenUsage(
        input_tokens=100,
        cache_creation_tokens=50,
        cache_read_tokens=25,
        output_tokens=75,
    )
    assert u.total == 250


def test_token_usage_update_from_duck_typed():
    @dataclass
    class FakeUsage:
        input_tokens: int = 10
        cache_creation_input_tokens: int = 5
        cache_read_input_tokens: int = 3
        output_tokens: int = 7

    u = TokenUsage()
    u.update_from(FakeUsage())
    assert u.input_tokens == 10
    assert u.cache_creation_tokens == 5
    assert u.cache_read_tokens == 3
    assert u.output_tokens == 7
    assert u.total == 25


def test_token_usage_update_from_missing_fields():
    u = TokenUsage(input_tokens=50)
    u.update_from(MagicMock(spec=[]))  # no attributes → all 0
    assert u.input_tokens == 50


def test_token_usage_accumulates_across_calls():
    @dataclass
    class FakeUsage:
        input_tokens: int
        cache_creation_input_tokens: int = 0
        cache_read_input_tokens: int = 0
        output_tokens: int = 0

    u = TokenUsage()
    u.update_from(FakeUsage(input_tokens=100))
    u.update_from(FakeUsage(input_tokens=200, output_tokens=50))
    assert u.input_tokens == 300
    assert u.output_tokens == 50
    assert u.total == 350


def test_token_usage_handles_none_fields():
    class FakeUsage:
        input_tokens = None
        cache_creation_input_tokens = None
        cache_read_input_tokens = None
        output_tokens = None

    u = TokenUsage(input_tokens=100)
    u.update_from(FakeUsage())
    # None fields should be treated as 0 via `or 0`
    assert u.input_tokens == 100


# ── build_messages_from_summary ───────────────────────────────────────────────


def test_build_messages_from_summary_structure():
    msgs = build_messages_from_summary("Car had P0300.")
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert "P0300" in msgs[0]["content"]
    assert msgs[1]["role"] == "assistant"


def test_build_messages_from_summary_wraps_text():
    msgs = build_messages_from_summary("Found misfire on cylinder 1.")
    assert "[Summary of earlier conversation]" in msgs[0]["content"]
    assert "Found misfire on cylinder 1." in msgs[0]["content"]


# ── ConversationContextManager helpers ────────────────────────────────────────


def _make_messages(n_turns: int) -> list[dict[str, Any]]:
    """Build a flat list of alternating user/assistant messages (n_turns pairs)."""
    msgs: list[dict[str, Any]] = []
    for i in range(n_turns):
        msgs.append({"role": "user", "content": f"Turn {i} user"})
        msgs.append({"role": "assistant", "content": f"Turn {i} assistant"})
    return msgs


@dataclass
class _FakeUsage:
    input_tokens: int
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    output_tokens: int = 0


def _make_manager(
    *,
    threshold: int = 150_000,
    keep_last_n_turns: int = 2,
    summary_text: str = "Diagnostic summary.",
) -> ConversationContextManager:
    """Build a manager with a mocked ClaudeClient whose stream returns summary_text."""

    class _FakeTextBlock:
        type = "text"

        def __init__(self, text: str) -> None:
            self.text = text

    class _FakeMessage:
        def __init__(self, text: str) -> None:
            self.content = [_FakeTextBlock(text)]

    class _FakeStream:
        def __init__(self, text: str) -> None:
            self._text = text

        async def __aenter__(self) -> "_FakeStream":
            return self

        async def __aexit__(self, *exc: Any) -> None:
            return None

        def __aiter__(self):
            async def _gen():
                return
                yield  # pragma: no cover — makes this an async generator

            return _gen()

        async def get_final_message(self) -> _FakeMessage:
            return _FakeMessage(self._text)

    fake_client = MagicMock()
    fake_client.stream.return_value = _FakeStream(summary_text)

    return ConversationContextManager(
        client=fake_client,
        compress_threshold=threshold,
        keep_last_n_turns=keep_last_n_turns,
    )


# ── ConversationContextManager: threshold / usage ─────────────────────────────


def test_should_compress_false_when_below_threshold():
    mgr = _make_manager(threshold=1000)
    mgr.record_usage(_FakeUsage(input_tokens=500))
    assert not mgr.should_compress


def test_should_compress_true_when_at_threshold():
    mgr = _make_manager(threshold=1000)
    mgr.record_usage(_FakeUsage(input_tokens=1000))
    assert mgr.should_compress


def test_should_compress_true_when_above_threshold():
    mgr = _make_manager(threshold=1000)
    mgr.record_usage(_FakeUsage(input_tokens=500))
    mgr.record_usage(_FakeUsage(input_tokens=600))
    assert mgr.should_compress


def test_record_usage_accumulates():
    mgr = _make_manager()
    mgr.record_usage(_FakeUsage(input_tokens=500, output_tokens=100))
    mgr.record_usage(_FakeUsage(input_tokens=300, cache_creation_input_tokens=50))
    assert mgr.usage.input_tokens == 800
    assert mgr.usage.output_tokens == 100
    assert mgr.usage.cache_creation_tokens == 50
    assert mgr.usage.total == 950


# ── ConversationContextManager: maybe_compress ───────────────────────────────


@pytest.mark.asyncio
async def test_maybe_compress_noop_when_below_threshold():
    mgr = _make_manager(threshold=1000)
    messages = _make_messages(5)
    result = await mgr.maybe_compress(messages)
    assert result is messages


@pytest.mark.asyncio
async def test_maybe_compress_compresses_when_above_threshold():
    mgr = _make_manager(threshold=1, keep_last_n_turns=2, summary_text="Diagnostic summary.")
    mgr.record_usage(_FakeUsage(input_tokens=100))

    messages = _make_messages(5)  # 10 messages; keep 2 turns = 4 → compress 6
    result = await mgr.maybe_compress(messages)

    # 2 summary messages + 4 recent = 6
    assert len(result) == 6
    assert result[0]["role"] == "user"
    assert "Diagnostic summary." in result[0]["content"]
    assert result[1]["role"] == "assistant"
    # Last 4 messages are the verbatim recent turns.
    assert result[2:] == messages[-4:]
    assert mgr.last_summary == "Diagnostic summary."


@pytest.mark.asyncio
async def test_maybe_compress_noop_when_history_too_short():
    """If messages <= keep_count, there is nothing old to summarize."""
    mgr = _make_manager(threshold=1, keep_last_n_turns=5)
    mgr.record_usage(_FakeUsage(input_tokens=100))

    messages = _make_messages(3)  # 6 messages < keep_count=10 → nothing to compress
    result = await mgr.maybe_compress(messages)
    assert result is messages


@pytest.mark.asyncio
async def test_compress_preserves_exact_recent_messages():
    mgr = _make_manager(threshold=1, keep_last_n_turns=3, summary_text="Ok")
    mgr.record_usage(_FakeUsage(input_tokens=100))

    messages = _make_messages(8)  # 16 messages, keep 6 → compress 10
    result = await mgr.maybe_compress(messages)

    assert result[-6:] == messages[-6:]


@pytest.mark.asyncio
async def test_compress_sets_last_summary():
    mgr = _make_manager(threshold=1, keep_last_n_turns=2, summary_text="Key findings.")
    mgr.record_usage(_FakeUsage(input_tokens=100))

    assert mgr.last_summary is None
    await mgr.maybe_compress(_make_messages(5))
    assert mgr.last_summary == "Key findings."


@pytest.mark.asyncio
async def test_compress_failure_returns_original_messages():
    """Summarization failure must not destroy the conversation history."""

    class _ErrorStream:
        async def __aenter__(self) -> "_ErrorStream":
            return self

        async def __aexit__(self, *exc: Any) -> None:
            return None

        def __aiter__(self):
            async def _gen():
                return
                yield  # pragma: no cover

            return _gen()

        async def get_final_message(self) -> None:
            raise RuntimeError("Anthropic API unreachable")

    fake_client = MagicMock()
    fake_client.stream.return_value = _ErrorStream()

    mgr = ConversationContextManager(
        client=fake_client,
        compress_threshold=1,
        keep_last_n_turns=1,
    )
    mgr.record_usage(_FakeUsage(input_tokens=100))

    messages = _make_messages(5)
    result = await mgr.maybe_compress(messages)
    assert result is messages
    assert mgr.last_summary is None


# ── ConversationContextManager: summarize call shape ─────────────────────────


@pytest.mark.asyncio
async def test_summarize_call_uses_haiku_model():
    """Compression must use Haiku (not Sonnet) to keep costs low."""
    from app.claude.models import SHORT_CLARIFICATION_MODEL

    captured: dict[str, Any] = {}

    class _CaptureStream:
        async def __aenter__(self) -> "_CaptureStream":
            return self

        async def __aexit__(self, *exc: Any) -> None:
            return None

        def __aiter__(self):
            async def _gen():
                return
                yield  # pragma: no cover

            return _gen()

        async def get_final_message(self):
            class _Msg:
                class _Block:
                    type = "text"
                    text = "summary"

                content = [_Block()]

            return _Msg()

    def _stream_factory(**kwargs: Any) -> _CaptureStream:
        captured.update(kwargs)
        return _CaptureStream()

    fake_client = MagicMock()
    fake_client.stream.side_effect = _stream_factory

    mgr = ConversationContextManager(
        client=fake_client, compress_threshold=1, keep_last_n_turns=1
    )
    mgr.record_usage(_FakeUsage(input_tokens=100))
    await mgr.maybe_compress(_make_messages(5))

    assert captured.get("model") == SHORT_CLARIFICATION_MODEL
    assert captured.get("max_tokens") == 1024


@pytest.mark.asyncio
async def test_summarize_appends_user_request_message():
    """The last message sent to Haiku must be a user request to summarize."""
    sent_messages: list[dict[str, Any]] = []

    class _CaptureStream:
        async def __aenter__(self) -> "_CaptureStream":
            return self

        async def __aexit__(self, *exc: Any) -> None:
            return None

        def __aiter__(self):
            async def _gen():
                return
                yield  # pragma: no cover

            return _gen()

        async def get_final_message(self):
            class _Msg:
                class _Block:
                    type = "text"
                    text = "summary"

                content = [_Block()]

            return _Msg()

    def _stream_factory(**kwargs: Any) -> _CaptureStream:
        sent_messages.extend(kwargs.get("messages", []))
        return _CaptureStream()

    fake_client = MagicMock()
    fake_client.stream.side_effect = _stream_factory

    mgr = ConversationContextManager(
        client=fake_client, compress_threshold=1, keep_last_n_turns=1
    )
    mgr.record_usage(_FakeUsage(input_tokens=100))
    await mgr.maybe_compress(_make_messages(4))

    assert sent_messages[-1]["role"] == "user"
    assert "summarize" in sent_messages[-1]["content"].lower()
