"""WebSocket session route: streams Claude assistant turns to the phone.

Protocol
--------
Inbound (phone → backend):
  * ``{"type":"auth","token":"<jwt>"}``       — only if no `?token=` query
  * ``{"type":"register","supported_pids":[...],"vin":...,"locale":...}``
  * ``{"type":"user_message","id":"...","content":"..."}``
  * ``{"type":"tool_result","tool_use_id":"...","content":...,"is_error":false}``
  * ``{"type":"confirm_write","name":"<tool>"}``  — user confirms a write tool
  * ``{"type":"abort"}``  — cancel the in-flight assistant turn
  * ``{"type":"resume","last_seq":N}``  — replay frames with seq > N
  * ``{"type":"obd_data",...}``  — opaque telemetry, acked

Outbound (backend → phone) — every frame carries a monotonic per-session
``seq`` so the phone can resume after a reconnect:
  * ``{"type":"registered","seq":N,...}``
  * ``{"type":"assistant_message_start","seq":N,"message_id":"..."}``
  * ``{"type":"text_delta","seq":N,"message_id":"...","text":"..."}``
  * ``{"type":"tool_call","seq":N,"message_id":"...","tool_use_id":"...","name":"...","input":{...}}``
  * ``{"type":"tool_call_completed","seq":N,"tool_use_id":"...","elapsed_ms":N,"truncated":bool}``
  * ``{"type":"tool_call_error","seq":N,"tool_use_id":"...","reason":"...","message":"..."}``
  * ``{"type":"assistant_message_end","seq":N,"message_id":"..."}``
  * ``{"type":"turn_complete","seq":N,"stop_reason":"...","iterations":N}``
  * ``{"type":"replay_complete","seq":N}``  — emitted at end of resume
  * ``{"type":"error","seq":N,"code":"...","message":"..."}``
  * ``{"type":"ack","seq":N,"received":"..."}``

A bounded replay buffer (``_REPLAY_BUFFER_SIZE`` most-recent frames) is
kept per connection so a brief drop can replay the partial assistant
message that was streaming when the socket disappeared.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.rate_limit import check_ai_rate_limit
from ..claude import (
    ClaudeClient,
    TextDelta,
    ToolCallCompleted,
    ToolCallDispatched,
    ToolCallError,
    TurnComplete,
    WebSocketToolTransport,
    build_system_prompt,
    run_assistant_turn,
)
from ..config import settings
from ..db import get_session
from ..models import DiagnosticSession, Message
from ..security import TokenError, decode_access_token

log = structlog.get_logger(__name__)

router = APIRouter(tags=["ws"])

_CLOSE_UNAUTHORIZED = 4001
_CLOSE_BAD_PROTOCOL = 4002

# How many recent outbound frames to remember for resume replay. Sized for a
# typical assistant turn (start + many text_delta + a few tool events + end +
# turn_complete) plus a margin for short-lived drops mid-stream.
_REPLAY_BUFFER_SIZE = 256


# ── Authentication ────────────────────────────────────────────────────────────


async def _authenticate(websocket: WebSocket, token: str | None) -> int | None:
    """Return user_id on success, or send an error close and return None."""
    if token is not None:
        try:
            payload = decode_access_token(token)
            return int(payload["sub"])
        except (TokenError, ValueError, KeyError):
            await websocket.send_json(
                {"type": "error", "code": "unauthorized", "message": "invalid or expired token"}
            )
            await websocket.close(code=_CLOSE_UNAUTHORIZED)
            return None

    try:
        raw = await websocket.receive_text()
        frame = json.loads(raw)
    except Exception:
        await websocket.close(code=_CLOSE_BAD_PROTOCOL)
        return None

    if frame.get("type") != "auth" or not frame.get("token"):
        await websocket.send_json(
            {
                "type": "error",
                "code": "unauthorized",
                "message": 'first frame must be {"type":"auth","token":"<jwt>"}',
            }
        )
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None

    try:
        payload = decode_access_token(frame["token"])
        return int(payload["sub"])
    except (TokenError, ValueError, KeyError):
        await websocket.send_json(
            {"type": "error", "code": "unauthorized", "message": "invalid or expired token"}
        )
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None


# ── Per-connection state ──────────────────────────────────────────────────────


@dataclass
class _SessionState:
    websocket: WebSocket
    session_id: str
    user_id: int
    supported_pids: list[str]
    vin: str | None
    locale: str
    transport: WebSocketToolTransport
    messages: list[dict[str, Any]] = field(default_factory=list)
    seq: int = 0
    replay: deque[dict[str, Any]] = field(
        default_factory=lambda: deque(maxlen=_REPLAY_BUFFER_SIZE)
    )
    turn_task: asyncio.Task[None] | None = None
    # Write tools pre-approved by the user via a `confirm_write` frame.
    # Consumed (cleared) at the start of each turn so confirmation is one-shot.
    confirmed_writes: set[str] = field(default_factory=set)
    # Cumulative Anthropic API tokens consumed this session (input + output).
    tokens_used: int = 0

    async def send(self, frame: dict[str, Any]) -> None:
        self.seq += 1
        frame = {**frame, "seq": self.seq}
        self.replay.append(frame)
        await self.websocket.send_json(frame)

    async def replay_since(self, last_seq: int) -> None:
        for frame in self.replay:
            if frame["seq"] > last_seq:
                await self.websocket.send_json(frame)
        await self.send({"type": "replay_complete"})


# ── Claude client factory ─────────────────────────────────────────────────────


def _claude_client_for(websocket: WebSocket) -> ClaudeClient:
    """Resolve the ClaudeClient — tests inject one via ``app.state.claude_client``."""
    override = getattr(websocket.app.state, "claude_client", None)
    if override is not None:
        return override
    client = ClaudeClient()
    websocket.app.state.claude_client = client
    return client


# ── Assistant turn ────────────────────────────────────────────────────────────


async def _run_turn(
    state: _SessionState,
    *,
    client: ClaudeClient,
    db: AsyncSession,
    tools: list[dict[str, Any]] | None,
) -> None:
    """Stream one assistant turn through the dispatcher and out to the phone."""
    assistant_message_id = uuid.uuid4().hex
    pending_text: list[str] = []
    started = False

    async def ensure_started() -> None:
        nonlocal started
        if not started:
            started = True
            await state.send(
                {
                    "type": "assistant_message_start",
                    "message_id": assistant_message_id,
                }
            )

    system_blocks = build_system_prompt(locale=state.locale, vin=state.vin)

    # Snapshot and clear confirmed_writes atomically — confirmation is one-shot.
    confirmed_snap = frozenset(state.confirmed_writes)
    state.confirmed_writes.clear()

    try:
        async for event in run_assistant_turn(
            client=client,
            transport=state.transport,
            messages=state.messages,
            system=system_blocks,
            tools=tools,
            confirmed_writes=confirmed_snap,
        ):
            if isinstance(event, TextDelta):
                await ensure_started()
                pending_text.append(event.text)
                await state.send(
                    {
                        "type": "text_delta",
                        "message_id": assistant_message_id,
                        "text": event.text,
                    }
                )
            elif isinstance(event, ToolCallDispatched):
                await ensure_started()
                await state.send(
                    {
                        "type": "tool_call",
                        "message_id": assistant_message_id,
                        "tool_use_id": event.tool_use_id,
                        "name": event.name,
                        "input": event.input,
                    }
                )
            elif isinstance(event, ToolCallCompleted):
                await state.send(
                    {
                        "type": "tool_call_completed",
                        "tool_use_id": event.tool_use_id,
                        "name": event.name,
                        "elapsed_ms": event.elapsed_ms,
                        "truncated": event.truncated,
                    }
                )
            elif isinstance(event, ToolCallError):
                await state.send(
                    {
                        "type": "tool_call_error",
                        "tool_use_id": event.tool_use_id,
                        "name": event.name,
                        "reason": event.reason,
                        "message": event.message,
                    }
                )
            elif isinstance(event, TurnComplete):
                state.tokens_used += event.input_tokens + event.output_tokens
                if started:
                    await state.send(
                        {
                            "type": "assistant_message_end",
                            "message_id": assistant_message_id,
                        }
                    )
                await state.send(
                    {
                        "type": "turn_complete",
                        "stop_reason": event.stop_reason,
                        "iterations": event.iterations,
                        "input_tokens": event.input_tokens,
                        "output_tokens": event.output_tokens,
                    }
                )
    except asyncio.CancelledError:
        if started:
            await state.send(
                {
                    "type": "assistant_message_end",
                    "message_id": assistant_message_id,
                }
            )
        await state.send(
            {"type": "turn_complete", "stop_reason": "aborted", "iterations": 0}
        )
        raise
    except Exception as exc:  # pragma: no cover — defensive
        log.exception("ws_turn_failed", session_id=state.session_id)
        await state.send(
            {"type": "error", "code": "turn_failed", "message": str(exc)}
        )
        return

    text_for_db = "".join(pending_text).strip()
    if text_for_db:
        db.add(
            Message(
                id=assistant_message_id,
                session_id=state.session_id,
                role="assistant",
                content=text_for_db,
            )
        )
        await db.commit()


# ── Frame handlers ────────────────────────────────────────────────────────────


async def _handle_user_message(
    state: _SessionState,
    frame: dict[str, Any],
    *,
    client: ClaudeClient,
    db: AsyncSession,
    tools: list[dict[str, Any]] | None,
) -> None:
    message_id = str(frame.get("id") or uuid.uuid4().hex)
    content = frame.get("content")
    if not isinstance(content, str) or not content.strip():
        await state.send(
            {
                "type": "error",
                "code": "bad_message",
                "message": "user_message requires non-empty 'content' string",
            }
        )
        return

    if not check_ai_rate_limit(state.user_id):
        await state.send(
            {
                "type": "error",
                "code": "rate_limited",
                "message": f"AI turn rate limit exceeded ({settings.ai_rate_limit}). Try again later.",
            }
        )
        return

    budget = settings.session_token_budget
    if budget > 0 and state.tokens_used >= budget:
        await state.send(
            {
                "type": "error",
                "code": "token_budget_exceeded",
                "message": f"Session token budget of {budget} tokens has been reached.",
            }
        )
        return

    if state.turn_task is not None and not state.turn_task.done():
        await state.send(
            {
                "type": "error",
                "code": "busy",
                "message": "an assistant turn is already in flight; send 'abort' first",
            }
        )
        return

    state.messages.append({"role": "user", "content": content})
    db.add(
        Message(
            id=message_id,
            session_id=state.session_id,
            role="user",
            content=content,
        )
    )
    await db.commit()

    state.turn_task = asyncio.create_task(
        _run_turn(state, client=client, db=db, tools=tools)
    )


async def _handle_tool_result(
    state: _SessionState, frame: dict[str, Any]
) -> None:
    tool_use_id = frame.get("tool_use_id")
    if not isinstance(tool_use_id, str):
        await state.send(
            {
                "type": "error",
                "code": "bad_message",
                "message": "tool_result requires 'tool_use_id'",
            }
        )
        return
    resolved = state.transport.resolve(
        tool_use_id,
        frame.get("content"),
        is_error=bool(frame.get("is_error", False)),
    )
    if not resolved:
        log.warning(
            "ws_tool_result_no_waiter",
            session_id=state.session_id,
            tool_use_id=tool_use_id,
        )


async def _handle_confirm_write(state: _SessionState, frame: dict[str, Any]) -> None:
    name = frame.get("name")
    if isinstance(name, str) and name:
        state.confirmed_writes.add(name)
    await state.send({"type": "ack", "received": "confirm_write"})


async def _handle_abort(state: _SessionState) -> None:
    task = state.turn_task
    if task is None or task.done():
        return
    task.cancel()
    state.transport.fail_all(asyncio.CancelledError())
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001 — best-effort
        pass


# ── Top-level route ───────────────────────────────────────────────────────────


@router.websocket("/ws/session/{session_id}")
async def ws_session(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
) -> None:
    await websocket.accept()

    user_id = await _authenticate(websocket, token)
    if user_id is None:
        return

    try:
        raw = await websocket.receive_text()
        frame = json.loads(raw)
    except Exception:
        await websocket.close(code=_CLOSE_BAD_PROTOCOL)
        return

    if frame.get("type") != "register":
        await websocket.send_json(
            {
                "type": "error",
                "code": "bad_protocol",
                "message": (
                    'expected {"type":"register","supported_pids":[...],"vin":...,"locale":...}'
                ),
            }
        )
        await websocket.close(code=_CLOSE_BAD_PROTOCOL)
        return

    supported_pids: list[str] = frame.get("supported_pids") or []
    vin: str | None = frame.get("vin")
    locale: str = frame.get("locale") or "en"

    # Reuse an existing diagnostic_session row if it already exists (e.g. on
    # reconnect with the same session_id); otherwise create one.
    existing = await db.get(DiagnosticSession, session_id)
    if existing is None:
        ds = DiagnosticSession(
            id=session_id,
            user_id=user_id,
            supported_pids=json.dumps(supported_pids),
            vin=vin,
            locale=locale,
        )
        db.add(ds)
        await db.commit()

    log.info("ws_session_registered", session_id=session_id, user_id=user_id, vin=vin)

    state = _SessionState(
        websocket=websocket,
        session_id=session_id,
        user_id=user_id,
        supported_pids=supported_pids,
        vin=vin,
        locale=locale,
        transport=WebSocketToolTransport(websocket),
    )
    await state.send(
        {"type": "registered", "session_id": session_id, "user_id": user_id}
    )

    client = _claude_client_for(websocket)
    tools = getattr(websocket.app.state, "claude_tools", None)

    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {
        "user_message": lambda f: _handle_user_message(
            state, f, client=client, db=db, tools=tools
        ),
        "tool_result": lambda f: _handle_tool_result(state, f),
        "confirm_write": lambda f: _handle_confirm_write(state, f),
        "abort": lambda _f: _handle_abort(state),
        "resume": lambda f: state.replay_since(int(f.get("last_seq", 0))),
    }

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await state.send(
                    {"type": "error", "code": "bad_message", "message": "invalid JSON"}
                )
                continue

            kind = msg.get("type")
            handler = handlers.get(kind)
            if handler is not None:
                await handler(msg)
            else:
                # Unknown / opaque frames (e.g. telemetry) get a simple ack.
                await state.send({"type": "ack", "received": kind or "unknown"})
    except WebSocketDisconnect:
        await _handle_abort(state)
        ds = await db.get(DiagnosticSession, session_id)
        if ds is not None and ds.ended_at is None:
            ds.ended_at = datetime.now(UTC)
            await db.commit()
        log.info("ws_session_disconnected", session_id=session_id, user_id=user_id)
