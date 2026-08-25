"""WebSocket session route: streams Claude assistant turns to the phone.

Protocol
--------
Inbound (phone → backend):
  * ``{"type":"auth","token":"<jwt>"}``       — only if no `?token=` query
  * ``{"type":"register","supported_pids":[...],"vin":...,"locale":...,"adapter_connected":bool,"adapter_simulated":bool}``
  * ``{"type":"adapter_status","connected":bool,"simulated":bool,"supported_pids":[...],"vin":...}``
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.rate_limit import check_ai_rate_limit
from ..claude import (
    DEFAULT_TOOLS,
    ClaudeClient,
    TextDelta,
    ToolCallCompleted,
    ToolCallDispatched,
    ToolCallError,
    TurnComplete,
    WebSocketToolTransport,
    build_system_prompt,
    resolve_make,
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
_CLOSE_FORBIDDEN = 4003

# How many recent outbound frames to remember for resume replay. Sized for a
# typical assistant turn (start + many text_delta + a few tool events + end +
# turn_complete) plus a margin for short-lived drops mid-stream.
_REPLAY_BUFFER_SIZE = 256

# How long a new user message waits for a turn that has already streamed its
# `turn_complete` frame to finish its trailing bookkeeping. The phone renders
# the answer the moment that frame lands, so the user can (and does) hit send
# while the backend is still committing the transcript.
_TURN_SETTLE_SECONDS = 5.0


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
    # Whether the phone currently holds a live OBD-II link. Fed into the system
    # prompt every turn so the model states "not connected" instead of guessing
    # a plausible reading when its tools cannot reach the ECU.
    adapter_connected: bool = False
    # Whether that link is the demo simulator rather than a dongle in a car.
    # Travels beside `adapter_connected` instead of overriding it: in demo mode
    # the tools genuinely work, so the model must be told it can read *and*
    # that every value is generated — folding the two together would either
    # cripple the demo or let it describe invented numbers as the user's car.
    adapter_simulated: bool = False
    messages: list[dict[str, Any]] = field(default_factory=list)
    seq: int = 0
    replay: deque[dict[str, Any]] = field(
        default_factory=lambda: deque(maxlen=_REPLAY_BUFFER_SIZE)
    )
    turn_task: asyncio.Task[None] | None = None
    # True once the running turn has emitted `turn_complete` — it is then only
    # persisting the transcript, and a follow-up message may wait for it rather
    # than being refused as `busy`.
    turn_complete_sent: bool = False
    # Write tools pre-approved by the user via a `confirm_write` frame.
    # Consumed (cleared) at the start of each turn so confirmation is one-shot.
    confirmed_writes: set[str] = field(default_factory=set)
    # Cumulative Anthropic API tokens consumed this session (input + output).
    tokens_used: int = 0
    # Codes the phone last read off the ECU. Carried into the system prompt so
    # the model is handed their authoritative definitions rather than recalling
    # them — its recall of a manufacturer-specific code is really a guess at
    # which brand the number belongs to.
    recent_dtcs: list[str] = field(default_factory=list)
    # Make decoded from the VIN, filled on the first turn that has a VIN.
    # None means unknown, never a default: the wrong make yields the wrong
    # definition for every manufacturer-specific code.
    make: str | None = None

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
    state.turn_complete_sent = False

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

    # Decode the VIN into a make before building the prompt. Cached per VIN, so
    # this costs one short request per vehicle; if it fails the make stays None
    # and the assistant asks which car this is, which is slower than a wrong
    # answer but is not one.
    if state.make is None and state.vin:
        state.make = await resolve_make(state.vin)

    system_blocks = build_system_prompt(
        locale=state.locale,
        make=state.make,
        vin=state.vin,
        adapter_connected=state.adapter_connected,
        adapter_simulated=state.adapter_simulated,
        supported_pids=state.supported_pids,
        recent_dtcs=state.recent_dtcs or None,
    )

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
                state.turn_complete_sent = True
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
        state.turn_complete_sent = True
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

    task = state.turn_task
    if task is not None and not task.done() and state.turn_complete_sent:
        # The answer is already on screen and the turn is only writing the
        # transcript out. Waiting is safe here — a finished turn asks the phone
        # for nothing, so no tool_result can be stuck behind this frame.
        await asyncio.wait({task}, timeout=_TURN_SETTLE_SECONDS)

    if task is not None and not task.done():
        await state.send(
            {
                "type": "error",
                "code": "busy",
                "message": "an assistant turn is already in flight; send 'abort' first",
            }
        )
        return

    db.add(
        Message(
            id=message_id,
            session_id=state.session_id,
            role="user",
            content=content,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        # Same message id twice — a resend after a flaky connection, or a
        # client bug. Persisting is impossible and re-running the turn would
        # answer twice, but an uncaught error here tears the WebSocket down and
        # costs the user their whole conversation. Refuse just this frame.
        await db.rollback()
        log.info(
            "ws_duplicate_message_id",
            session_id=state.session_id,
            message_id=message_id,
        )
        await state.send(
            {
                "type": "error",
                "code": "duplicate_message",
                "message": f"message id {message_id!r} was already received",
            }
        )
        return

    state.messages.append({"role": "user", "content": content})

    state.turn_task = asyncio.create_task(
        _run_turn(state, client=client, db=db, tools=tools)
    )


# Cap on codes carried in the prompt. A healthy ECU stores a handful; a very
# sick one can report dozens, and the whole list would crowd the context for no
# diagnostic gain.
_MAX_REMEMBERED_DTCS = 20


def _remember_dtcs(state: _SessionState, content: Any) -> None:
    """Record codes from a `read_dtcs`-shaped tool result.

    Keyed on the payload's shape rather than the tool name so it covers stored,
    pending and permanent reads alike without the WS layer having to track
    which tool a `tool_use_id` belonged to.
    """
    if not isinstance(content, dict):
        return
    entries = content.get("dtcs")
    if not isinstance(entries, list):
        return

    codes = list(state.recent_dtcs)
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        code = entry.get("code")
        if isinstance(code, str) and code and code not in codes:
            codes.append(code)
    state.recent_dtcs = codes[:_MAX_REMEMBERED_DTCS]


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
    content = frame.get("content")
    if not frame.get("is_error", False):
        _remember_dtcs(state, content)

    resolved = state.transport.resolve(
        tool_use_id,
        content,
        is_error=bool(frame.get("is_error", False)),
    )
    if not resolved:
        log.warning(
            "ws_tool_result_no_waiter",
            session_id=state.session_id,
            tool_use_id=tool_use_id,
        )


async def _handle_adapter_status(state: _SessionState, frame: dict[str, Any]) -> None:
    """Update live-link state mid-session.

    The phone sends this whenever the OBD-II adapter connects or drops, so the
    next turn's system prompt reflects reality without forcing a reconnect of
    the WebSocket. Getting this wrong in the "connected" direction is the
    dangerous one — the model would be told it can read a car it cannot reach —
    so anything other than an explicit ``true`` is treated as disconnected.
    """
    connected = frame.get("connected") is True
    state.adapter_connected = connected
    # Only meaningful while connected, and defaults to "real" the same way
    # `connected` defaults to "no link": a client that omits the flag is one
    # that has no simulator, so an absent field must never quietly mark a real
    # car's readings as generated either.
    state.adapter_simulated = connected and frame.get("simulated") is True

    pids = frame.get("supported_pids")
    if isinstance(pids, list):
        state.supported_pids = [str(p) for p in pids]
    if not connected:
        # Drop the PID list and the code set with the link. Keeping either
        # would let a later reconnect inherit facts that were never re-verified
        # on this vehicle — and the next car on this dongle is a different car.
        state.supported_pids = []
        state.recent_dtcs = []

    vin = frame.get("vin")
    if isinstance(vin, str) and vin and vin != state.vin:
        state.vin = vin
        state.make = None
        state.recent_dtcs = []

    log.info(
        "ws_adapter_status",
        session_id=state.session_id,
        connected=connected,
        simulated=state.adapter_simulated,
        supported_pid_count=len(state.supported_pids),
    )
    await state.send({"type": "ack", "received": "adapter_status"})


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
    # Older clients don't send `adapter_connected`. Falling back to
    # `bool(supported_pids)` matches what those clients meant: the phone only
    # populated the PID list when it had a live adapter.
    raw_connected = frame.get("adapter_connected")
    adapter_connected: bool = (
        raw_connected is True if raw_connected is not None else bool(supported_pids)
    )
    # Absent means a real adapter: only a client new enough to have demo mode
    # sends this, and guessing "simulated" for an old client would have the
    # assistant disown readings that really did come off the user's car.
    adapter_simulated: bool = adapter_connected and frame.get("adapter_simulated") is True

    # Reuse an existing diagnostic_session row if it already exists (e.g. on
    # reconnect with the same session_id); otherwise create one.
    existing = await db.get(DiagnosticSession, session_id)
    if existing is not None and existing.user_id != user_id:
        # Session UUIDs are not secrets — without this ownership check, any
        # authenticated user who learned a session_id could attach to it.
        log.warning(
            "ws_session_hijack_attempt",
            session_id=session_id,
            requesting_user_id=user_id,
            owner_user_id=existing.user_id,
        )
        await websocket.close(code=_CLOSE_FORBIDDEN)
        return
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

    log.info(
        "ws_session_registered",
        session_id=session_id,
        user_id=user_id,
        vin=vin,
        adapter_connected=adapter_connected,
        adapter_simulated=adapter_simulated,
    )

    state = _SessionState(
        websocket=websocket,
        session_id=session_id,
        user_id=user_id,
        supported_pids=supported_pids,
        vin=vin,
        locale=locale,
        transport=WebSocketToolTransport(websocket),
        adapter_connected=adapter_connected,
        adapter_simulated=adapter_simulated,
    )
    await state.send(
        {"type": "registered", "session_id": session_id, "user_id": user_id}
    )

    client = _claude_client_for(websocket)
    # Fall back to the built-in catalogue when the app didn't install one.
    # Without tools the model cannot request a reading at all — and a model
    # asked for a number it cannot fetch tends to narrate a plausible one, so
    # an empty tool list is a correctness bug, not a degraded mode.
    tools = getattr(websocket.app.state, "claude_tools", None) or DEFAULT_TOOLS

    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[None]]] = {
        "user_message": lambda f: _handle_user_message(
            state, f, client=client, db=db, tools=tools
        ),
        "tool_result": lambda f: _handle_tool_result(state, f),
        "confirm_write": lambda f: _handle_confirm_write(state, f),
        "adapter_status": lambda f: _handle_adapter_status(state, f),
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
