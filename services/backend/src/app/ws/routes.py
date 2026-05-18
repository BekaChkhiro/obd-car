from __future__ import annotations

import json
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import DiagnosticSession
from ..security import TokenError, decode_access_token

log = structlog.get_logger(__name__)

router = APIRouter(tags=["ws"])

_CLOSE_UNAUTHORIZED = 4001
_CLOSE_BAD_PROTOCOL = 4002


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

    # No query token — expect an auth frame as the first message.
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

    # Expect a register frame that declares device capabilities.
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
                "message": 'expected {"type":"register","supported_pids":[...],"vin":...,"locale":...}',
            }
        )
        await websocket.close(code=_CLOSE_BAD_PROTOCOL)
        return

    supported_pids: list[str] = frame.get("supported_pids") or []
    vin: str | None = frame.get("vin")
    locale: str = frame.get("locale") or "en"

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
    await websocket.send_json(
        {"type": "registered", "session_id": session_id, "user_id": user_id}
    )

    # Message loop — T3.2+ will forward messages to Claude.
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "code": "bad_message", "message": "invalid JSON"}
                )
                continue
            await websocket.send_json({"type": "ack", "received": msg.get("type", "unknown")})
    except WebSocketDisconnect:
        ds.ended_at = datetime.now(UTC)
        await db.commit()
        log.info("ws_session_disconnected", session_id=session_id, user_id=user_id)
