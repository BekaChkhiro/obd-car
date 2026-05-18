"""Transport abstraction for phone-side tool execution.

The dispatcher (`dispatcher.run_assistant_turn`) speaks to a transport when
Claude requests a tool call. In production the transport is backed by the
WebSocket session (T3.1) — the backend sends a `tool_call` frame to the
phone, the phone runs the BLE command (T1.7 serialises ELM327 access), and
the phone replies with a `tool_result` frame keyed by `tool_use_id`.

The protocol is deliberately thin: one `call(...)` coroutine that resolves
with the parsed phone payload (any JSON-serialisable value). The dispatcher
handles timeouts, truncation, and Anthropic `tool_result` shaping itself.
"""

from __future__ import annotations

import asyncio
from typing import Any, Protocol

from fastapi import WebSocket


class ToolTransportError(Exception):
    """Raised by a transport when the phone reports an execution error.

    The string payload becomes the `content` of an `is_error: true`
    tool_result block, so callers should keep it short and human-readable.
    """


class ToolTransport(Protocol):
    """Phone-side tool execution channel.

    Implementations MUST raise `asyncio.TimeoutError` if the phone does not
    respond before the dispatcher's wait window elapses — the dispatcher
    catches it and produces a `timeout` tool_call_error event. Any other
    failure should raise `ToolTransportError` with a short message.
    """

    async def call(
        self,
        *,
        tool_use_id: str,
        name: str,
        input: dict[str, Any],
    ) -> Any:  # pragma: no cover - protocol
        ...


class WebSocketToolTransport:
    """`ToolTransport` backed by a single FastAPI WebSocket session.

    The WS message loop is responsible for reading frames; when it sees a
    `tool_result` frame it must call `resolve(tool_use_id, payload, ...)`
    to wake the awaiting `call(...)`.

    This is decoupled from the dispatcher itself so the dispatcher can be
    unit-tested without a live WebSocket.
    """

    def __init__(self, websocket: WebSocket) -> None:
        self._ws = websocket
        self._pending: dict[str, asyncio.Future[Any]] = {}

    async def call(
        self,
        *,
        tool_use_id: str,
        name: str,
        input: dict[str, Any],
    ) -> Any:
        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()
        if tool_use_id in self._pending:
            raise ToolTransportError(f"duplicate tool_use_id: {tool_use_id}")
        self._pending[tool_use_id] = future
        try:
            await self._ws.send_json(
                {
                    "type": "tool_call",
                    "tool_use_id": tool_use_id,
                    "name": name,
                    "input": input,
                }
            )
            return await future
        finally:
            self._pending.pop(tool_use_id, None)

    def resolve(
        self,
        tool_use_id: str,
        payload: Any,
        *,
        is_error: bool = False,
    ) -> bool:
        """Wake the `call(...)` awaiting this tool_use_id. Returns False if no caller is waiting."""
        future = self._pending.get(tool_use_id)
        if future is None or future.done():
            return False
        if is_error:
            message = str(payload) if not isinstance(payload, str) else payload
            future.set_exception(ToolTransportError(message))
        else:
            future.set_result(payload)
        return True

    def fail_all(self, exc: BaseException) -> None:
        """Resolve every pending call with `exc`. Used when the WS disconnects."""
        for future in list(self._pending.values()):
            if not future.done():
                future.set_exception(exc)
        self._pending.clear()

    @property
    def pending_count(self) -> int:
        return len(self._pending)
