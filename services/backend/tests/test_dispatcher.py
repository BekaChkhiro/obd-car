from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.claude import (
    ClaudeClient,
    TextDelta,
    ToolCallCompleted,
    ToolCallDispatched,
    ToolCallError,
    ToolTransportError,
    TurnComplete,
    WebSocketToolTransport,
    run_assistant_turn,
)
from app.claude.dispatcher import _truncate_for_anthropic

# ── Fakes for the Anthropic SDK stream ────────────────────────────────────────


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


class _FakeStream:
    """One round-trip with the Anthropic stream API: iterate events, then `get_final_message()`."""

    def __init__(self, events: list[Any], final_message: _FakeMessage) -> None:
        self._events = events
        self._final = final_message

    async def __aenter__(self) -> _FakeStream:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    def __aiter__(self):
        async def gen():
            for e in self._events:
                yield e

        return gen()

    async def get_final_message(self) -> _FakeMessage:
        return self._final


@dataclass
class _ScriptedClient:
    """ClaudeClient stand-in that returns a queued stream per `.stream()` call."""

    streams: list[_FakeStream] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)
    default_model: str = "claude-sonnet-4-6"

    def pick_model(self, *, short_clarification: bool = False) -> str:  # pragma: no cover
        return self.default_model

    def stream(self, **kwargs: Any) -> _FakeStream:
        self.calls.append(kwargs)
        if not self.streams:
            raise AssertionError("Scripted client ran out of queued streams")
        return self.streams.pop(0)


def _tool_use(*, id: str, name: str, input: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_use", "id": id, "name": name, "input": input}


def _text(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


# ── Fake transport ────────────────────────────────────────────────────────────


class _ScriptedTransport:
    """Returns canned payloads per (name) or raises a queued exception."""

    def __init__(self) -> None:
        self.results: dict[str, list[Any]] = {}
        self.delays: dict[str, float] = {}
        self.calls: list[dict[str, Any]] = []

    def queue(self, name: str, payload: Any) -> None:
        self.results.setdefault(name, []).append(payload)

    def queue_delay(self, name: str, seconds: float) -> None:
        self.delays[name] = seconds

    async def call(self, *, tool_use_id: str, name: str, input: dict[str, Any]) -> Any:
        self.calls.append({"tool_use_id": tool_use_id, "name": name, "input": input})
        if name in self.delays:
            await asyncio.sleep(self.delays[name])
        if name not in self.results or not self.results[name]:
            raise AssertionError(f"unexpected transport.call('{name}')")
        payload = self.results[name].pop(0)
        if isinstance(payload, BaseException):
            raise payload
        return payload


# ── _truncate_for_anthropic unit tests ────────────────────────────────────────


def test_truncate_string_passthrough_when_small():
    out, truncated = _truncate_for_anthropic("hello", max_bytes=100)
    assert out == "hello"
    assert truncated is False


def test_truncate_string_clips_when_oversize():
    out, truncated = _truncate_for_anthropic("a" * 5000, max_bytes=200)
    assert truncated is True
    assert out.endswith("[truncated]")
    assert len(out.encode("utf-8")) <= 200


def test_truncate_json_encodes_dict():
    out, truncated = _truncate_for_anthropic({"rpm": 3210}, max_bytes=100)
    assert out == '{"rpm": 3210}'
    assert truncated is False


def test_truncate_handles_utf8_boundaries():
    # Multi-byte char near the cut point shouldn't blow up.
    out, truncated = _truncate_for_anthropic("ё" * 500, max_bytes=80)
    assert truncated is True
    assert out.endswith("[truncated]")
    # Result must still be valid UTF-8 (decode succeeds).
    out.encode("utf-8").decode("utf-8")


# ── Dispatcher: happy paths ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_text_only_response_completes_in_one_iteration():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[
                    _FakeContentBlockDeltaEvent(_FakeTextDelta("Hi ")),
                    _FakeContentBlockDeltaEvent(_FakeTextDelta("there")),
                ],
                final_message=_FakeMessage(content=[_text("Hi there")], stop_reason="end_turn"),
            )
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "hello"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
    ):
        events.append(evt)

    text = [e for e in events if isinstance(e, TextDelta)]
    final = [e for e in events if isinstance(e, TurnComplete)]
    assert [t.text for t in text] == ["Hi ", "there"]
    assert len(final) == 1
    assert final[0].stop_reason == "end_turn"
    assert final[0].iterations == 1
    # Assistant turn appended.
    assert messages[-1]["role"] == "assistant"
    assert messages[-1]["content"] == [_text("Hi there")]


@pytest.mark.asyncio
async def test_single_tool_call_then_final_response():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[_FakeContentBlockDeltaEvent(_FakeTextDelta("Reading RPM..."))],
                final_message=_FakeMessage(
                    content=[
                        _text("Reading RPM..."),
                        _tool_use(id="tu_1", name="read_pid", input={"pid": "010C"}),
                    ],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[_FakeContentBlockDeltaEvent(_FakeTextDelta("RPM is 3210."))],
                final_message=_FakeMessage(content=[_text("RPM is 3210.")], stop_reason="end_turn"),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("read_pid", {"value": 3210, "unit": "rpm"})
    messages: list[dict[str, Any]] = [{"role": "user", "content": "What's the engine RPM?"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[{"name": "read_pid", "input_schema": {"type": "object"}}],
    ):
        events.append(evt)

    dispatched = [e for e in events if isinstance(e, ToolCallDispatched)]
    completed = [e for e in events if isinstance(e, ToolCallCompleted)]
    assert len(dispatched) == 1
    assert dispatched[0].name == "read_pid"
    assert dispatched[0].input == {"pid": "010C"}
    assert len(completed) == 1
    assert completed[0].name == "read_pid"
    assert completed[0].truncated is False

    final = [e for e in events if isinstance(e, TurnComplete)][0]
    assert final.iterations == 2
    assert final.stop_reason == "end_turn"

    # The tool_result was injected into messages between assistant turns.
    assert messages[1]["role"] == "assistant"
    tool_result_turn = messages[2]
    assert tool_result_turn["role"] == "user"
    assert tool_result_turn["content"] == [
        {
            "type": "tool_result",
            "tool_use_id": "tu_1",
            "content": '{"value": 3210, "unit": "rpm"}',
        }
    ]
    assert transport.calls == [
        {"tool_use_id": "tu_1", "name": "read_pid", "input": {"pid": "010C"}}
    ]


@pytest.mark.asyncio
async def test_parallel_tool_uses_dispatched_in_order():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[
                        _tool_use(id="a", name="read_pid", input={"pid": "010C"}),
                        _tool_use(id="b", name="read_pid", input={"pid": "010D"}),
                    ],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(content=[_text("ok")], stop_reason="end_turn"),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("read_pid", {"value": 3210})
    transport.queue("read_pid", {"value": 78})
    messages: list[dict[str, Any]] = [{"role": "user", "content": "RPM and speed?"}]

    completed: list[ToolCallCompleted] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
    ):
        if isinstance(evt, ToolCallCompleted):
            completed.append(evt)

    assert [c.tool_use_id for c in completed] == ["a", "b"]
    # Phone got both calls, in order.
    assert [c["input"]["pid"] for c in transport.calls] == ["010C", "010D"]
    # Both results landed in the same user turn.
    tool_results = messages[2]["content"]
    assert len(tool_results) == 2
    assert {r["tool_use_id"] for r in tool_results} == {"a", "b"}


# ── Dispatcher: failure modes ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tool_timeout_emits_error_and_injects_is_error_result():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="t", name="read_pid", input={"pid": "010C"})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_text("sorry, ELM didn't reply")], stop_reason="end_turn"
                ),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue_delay("read_pid", 0.2)
    transport.queue("read_pid", {"value": 1})
    messages: list[dict[str, Any]] = [{"role": "user", "content": "ping"}]

    errors: list[ToolCallError] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        tool_timeout=0.05,
    ):
        if isinstance(evt, ToolCallError):
            errors.append(evt)

    assert len(errors) == 1
    assert errors[0].reason == "timeout"
    tool_result = messages[2]["content"][0]
    assert tool_result["is_error"] is True
    assert "did not respond" in tool_result["content"]


@pytest.mark.asyncio
async def test_transport_error_is_surfaced_to_model():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="t", name="read_dtcs", input={})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_text("Phone says no")], stop_reason="end_turn"
                ),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("read_dtcs", ToolTransportError("BLE disconnected"))
    messages: list[dict[str, Any]] = [{"role": "user", "content": "DTCs?"}]

    errors: list[ToolCallError] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
    ):
        if isinstance(evt, ToolCallError):
            errors.append(evt)

    assert errors[0].reason == "transport_error"
    assert "BLE disconnected" in errors[0].message
    assert messages[2]["content"][0]["is_error"] is True


@pytest.mark.asyncio
async def test_oversized_tool_result_is_truncated():
    big_payload = {"history": ["x" * 1000 for _ in range(50)]}
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="t", name="read_pid", input={"pid": "010C"})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(content=[_text("ok")], stop_reason="end_turn"),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("read_pid", big_payload)
    messages: list[dict[str, Any]] = [{"role": "user", "content": "history?"}]

    completed: list[ToolCallCompleted] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        max_tool_result_bytes=512,
    ):
        if isinstance(evt, ToolCallCompleted):
            completed.append(evt)

    assert completed[0].truncated is True
    content = messages[2]["content"][0]["content"]
    assert content.endswith("[truncated]")
    assert len(content.encode("utf-8")) <= 512


# ── Write-tool confirmation ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clear_dtcs_blocked_without_confirmation():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="w", name="clear_dtcs", input={"confirmed": True})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_text("I'll ask first.")], stop_reason="end_turn"
                ),
            ),
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "clear codes"}]

    errors: list[ToolCallError] = []
    dispatched: list[ToolCallDispatched] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        # NB: confirmed_writes is empty — even though the model passed
        # confirmed=true in the input, the user has not confirmed
        # out-of-band, so the dispatcher refuses.
    ):
        if isinstance(evt, ToolCallError):
            errors.append(evt)
        if isinstance(evt, ToolCallDispatched):
            dispatched.append(evt)

    assert dispatched == []
    assert transport.calls == []
    assert errors[0].reason == "confirmation_required"
    tool_result = messages[2]["content"][0]
    assert tool_result["is_error"] is True
    assert "confirmation" in tool_result["content"].lower()


@pytest.mark.asyncio
async def test_clear_dtcs_executes_when_user_confirmed_and_flag_set():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="w", name="clear_dtcs", input={"confirmed": True})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_text("Codes cleared.")], stop_reason="end_turn"
                ),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("clear_dtcs", {"ok": True})
    messages: list[dict[str, Any]] = [{"role": "user", "content": "yes, clear"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        confirmed_writes={"clear_dtcs"},
    ):
        events.append(evt)

    completed = [e for e in events if isinstance(e, ToolCallCompleted)]
    assert len(completed) == 1
    assert transport.calls[0]["name"] == "clear_dtcs"


@pytest.mark.asyncio
async def test_clear_dtcs_blocked_when_flag_missing_even_with_allowlist():
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[_tool_use(id="w", name="clear_dtcs", input={})],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[],
                final_message=_FakeMessage(content=[_text("ok")], stop_reason="end_turn"),
            ),
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "clear"}]

    errors: list[ToolCallError] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        confirmed_writes={"clear_dtcs"},
    ):
        if isinstance(evt, ToolCallError):
            errors.append(evt)

    # User allow-listed it but model omitted the schema-required confirmed flag.
    # Belt-and-braces: still refused.
    assert errors[0].reason == "confirmation_required"
    assert transport.calls == []


# ── Iteration cap ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_max_iterations_caps_runaway_tool_loop():
    def make_loop_stream() -> _FakeStream:
        return _FakeStream(
            events=[],
            final_message=_FakeMessage(
                content=[_tool_use(id="x", name="read_pid", input={"pid": "010C"})],
                stop_reason="tool_use",
            ),
        )

    client = _ScriptedClient(streams=[make_loop_stream() for _ in range(3)])
    transport = _ScriptedTransport()
    for _ in range(3):
        transport.queue("read_pid", {"value": 1})

    messages: list[dict[str, Any]] = [{"role": "user", "content": "loop"}]
    final: TurnComplete | None = None
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        max_iterations=3,
    ):
        if isinstance(evt, TurnComplete):
            final = evt

    assert final is not None
    assert final.iterations == 3
    assert final.stop_reason == "tool_use"


# ── WebSocketToolTransport ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_websocket_transport_send_and_resolve():
    sent: list[dict[str, Any]] = []

    class FakeWS:
        async def send_json(self, frame: dict[str, Any]) -> None:
            sent.append(frame)

    transport = WebSocketToolTransport(FakeWS())  # type: ignore[arg-type]

    async def resolver() -> None:
        # Yield so the awaiting `call` can register the pending future.
        await asyncio.sleep(0)
        assert transport.resolve("t-1", {"value": 42}) is True

    result, _ = await asyncio.gather(
        transport.call(tool_use_id="t-1", name="read_pid", input={"pid": "010C"}),
        resolver(),
    )
    assert result == {"value": 42}
    assert sent == [
        {
            "type": "tool_call",
            "tool_use_id": "t-1",
            "name": "read_pid",
            "input": {"pid": "010C"},
        }
    ]
    assert transport.pending_count == 0


@pytest.mark.asyncio
async def test_websocket_transport_resolve_error_raises_in_caller():
    class FakeWS:
        async def send_json(self, frame: dict[str, Any]) -> None:
            return None

    transport = WebSocketToolTransport(FakeWS())  # type: ignore[arg-type]

    async def fail() -> None:
        await asyncio.sleep(0)
        assert transport.resolve("t-2", "ELM said NO DATA", is_error=True) is True

    with pytest.raises(ToolTransportError, match="NO DATA"):
        await asyncio.gather(
            transport.call(tool_use_id="t-2", name="read_pid", input={"pid": "010C"}),
            fail(),
        )


@pytest.mark.asyncio
async def test_websocket_transport_resolve_returns_false_for_unknown_id():
    class FakeWS:
        async def send_json(self, frame: dict[str, Any]) -> None:
            return None

    transport = WebSocketToolTransport(FakeWS())  # type: ignore[arg-type]
    assert transport.resolve("nope", {"value": 1}) is False


@pytest.mark.asyncio
async def test_websocket_transport_fail_all_wakes_all_pending():
    class FakeWS:
        async def send_json(self, frame: dict[str, Any]) -> None:
            return None

    transport = WebSocketToolTransport(FakeWS())  # type: ignore[arg-type]

    async def disconnect() -> None:
        await asyncio.sleep(0)
        transport.fail_all(ToolTransportError("websocket closed"))

    with pytest.raises(ToolTransportError, match="websocket closed"):
        await asyncio.gather(
            transport.call(tool_use_id="t-3", name="read_pid", input={}),
            disconnect(),
        )


def test_client_constructor_smoke():
    cc = ClaudeClient(client=MagicMock())
    assert cc.default_model


# ── Server tools: pause_turn ──────────────────────────────────────────────────


def _server_tool_use(*, id: str, name: str, input: dict[str, Any]) -> dict[str, Any]:
    return {"type": "server_tool_use", "id": id, "name": name, "input": input}


def _web_search_result(*, tool_use_id: str) -> dict[str, Any]:
    return {
        "type": "web_search_tool_result",
        "tool_use_id": tool_use_id,
        "content": [
            {
                "type": "web_search_result",
                "url": "https://obd-codes.com/p1133",
                "title": "P1133",
                "encrypted_content": "EqgfCioIARgBIiQ3",
            }
        ],
    }


@pytest.mark.asyncio
async def test_pause_turn_resumes_instead_of_truncating_the_answer():
    """A paused server-tool turn must be resent, not treated as terminal.

    Web search can push a long turn over the server-side limit; the API then
    returns `pause_turn` with the work unfinished. Breaking there produces an
    answer that stops mid-sentence with no error raised anywhere — the worst
    kind of failure, because it reads like a complete reply.
    """
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[_FakeContentBlockDeltaEvent(_FakeTextDelta("Looking that up"))],
                final_message=_FakeMessage(
                    content=[
                        _text("Looking that up"),
                        _server_tool_use(
                            id="srvtoolu_1", name="web_search", input={"query": "P1133 Honda"}
                        ),
                        _web_search_result(tool_use_id="srvtoolu_1"),
                    ],
                    stop_reason="pause_turn",
                ),
            ),
            _FakeStream(
                events=[_FakeContentBlockDeltaEvent(_FakeTextDelta(" — it is HO2S switching."))],
                final_message=_FakeMessage(
                    content=[_text(" — it is HO2S switching.")], stop_reason="end_turn"
                ),
            ),
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "what is P1133?"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
    ):
        events.append(evt)

    final = [e for e in events if isinstance(e, TurnComplete)][0]
    assert final.stop_reason == "end_turn"
    assert not client.streams, "the paused turn was never resumed"

    # Resuming means resending the paused assistant message unchanged — the
    # API rejects a web_search_tool_result whose encrypted_content was altered.
    # (The dispatcher mutates `messages` in place and hands the same list to
    # every request, so assert on the history rather than on one snapshot.)
    result_blocks = [
        b
        for m in messages
        if m["role"] == "assistant"
        for b in m["content"]
        if b["type"] == "web_search_tool_result"
    ]
    assert len(result_blocks) == 1
    assert result_blocks[0]["content"][0]["encrypted_content"] == "EqgfCioIARgBIiQ3"

    text = "".join(e.text for e in events if isinstance(e, TextDelta))
    assert text == "Looking that up — it is HO2S switching."


@pytest.mark.asyncio
async def test_pause_turn_does_not_spend_the_tool_iteration_budget():
    """Pauses extend the budget; they are extra requests, not tool round-trips.

    Otherwise a search-heavy turn eats the iterations the phone-side reads
    still need, and the model runs out of budget before it can call read_pid.
    """
    paused = [
        _FakeStream(
            events=[],
            final_message=_FakeMessage(
                content=[_text("searching")], stop_reason="pause_turn"
            ),
        )
        for _ in range(2)
    ]
    client = _ScriptedClient(
        streams=[
            *paused,
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[
                        _tool_use(id="t1", name="read_pid", input={"pid": "010C"})
                    ],
                    stop_reason="tool_use",
                ),
            ),
            _FakeStream(
                events=[_FakeContentBlockDeltaEvent(_FakeTextDelta("2450 rpm"))],
                final_message=_FakeMessage(content=[_text("2450 rpm")], stop_reason="end_turn"),
            ),
        ]
    )
    transport = _ScriptedTransport()
    transport.queue("read_pid", {"pid": "Engine RPM", "value": 2450, "unit": "rpm"})
    messages: list[dict[str, Any]] = [{"role": "user", "content": "rpm?"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        max_iterations=2,
    ):
        events.append(evt)

    final = [e for e in events if isinstance(e, TurnComplete)][0]
    assert final.stop_reason == "end_turn"
    assert [c["name"] for c in transport.calls] == ["read_pid"]


@pytest.mark.asyncio
async def test_pause_turn_storm_is_capped():
    """A server tool that never settles must not bill forever."""
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(content=[_text("…")], stop_reason="pause_turn"),
            )
            for _ in range(10)
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "hi"}]

    events: list[Any] = []
    async for evt in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
        max_pause_continuations=3,
    ):
        events.append(evt)

    final = [e for e in events if isinstance(e, TurnComplete)][0]
    assert final.stop_reason == "pause_turn"
    # One initial request plus the capped number of resumes.
    assert len(client.calls) == 4


@pytest.mark.asyncio
async def test_server_tool_blocks_are_never_dispatched_to_the_phone():
    """`server_tool_use` runs on Anthropic's side; the phone has no handler.

    Routing one over the WebSocket bridge would surface to the user as
    'Unknown tool' and strand the turn waiting for a result that never comes.
    """
    client = _ScriptedClient(
        streams=[
            _FakeStream(
                events=[],
                final_message=_FakeMessage(
                    content=[
                        _server_tool_use(
                            id="srvtoolu_9", name="web_search", input={"query": "P1133"}
                        ),
                        _web_search_result(tool_use_id="srvtoolu_9"),
                        _text("Per obd-codes.com, …"),
                    ],
                    stop_reason="end_turn",
                ),
            )
        ]
    )
    transport = _ScriptedTransport()
    messages: list[dict[str, Any]] = [{"role": "user", "content": "what is P1133?"}]

    async for _ in run_assistant_turn(
        client=client,  # type: ignore[arg-type]
        transport=transport,
        messages=messages,
        tools=[],
    ):
        pass

    assert transport.calls == []
