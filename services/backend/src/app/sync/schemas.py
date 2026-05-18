"""Wire format for the mobile ↔ backend sync protocol.

The client speaks string UUIDs as canonical primary keys (the same UUID lives
both locally and on the server). `server_id` in push acks is a sentinel
acknowledgement field — the actual identity is `id`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ──────────────────────────────────────────────────────────────────────────────
# Push — client → server
# ──────────────────────────────────────────────────────────────────────────────


class VehiclePush(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    make: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    year: int | None = None
    vin: str | None = Field(default=None, max_length=17)
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class SessionPush(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    vehicle_id: str | None = Field(default=None, max_length=64)
    created_at: datetime


class MessagePush(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=64)
    role: Literal["user", "assistant", "tool"]
    content: str
    created_at: datetime


class ToolCallPush(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    message_id: str = Field(min_length=1, max_length=64)
    tool_name: str = Field(min_length=1, max_length=100)
    input: str
    output: str | None = None
    created_at: datetime


class PushRequest(BaseModel):
    vehicles: list[VehiclePush] = Field(default_factory=list)
    sessions: list[SessionPush] = Field(default_factory=list)
    messages: list[MessagePush] = Field(default_factory=list)
    tool_calls: list[ToolCallPush] = Field(default_factory=list)


class PushAck(BaseModel):
    """One row's worth of server acknowledgement.

    `accepted=True` means the row is now reflected in the server state
    (either by accepting the client copy or — for LWW conflicts — by the
    server keeping its newer copy and returning it in the next pull).
    """

    id: str
    accepted: bool
    server_updated_at: datetime
    conflict: Literal["none", "server-newer"] = "none"


class PushResponse(BaseModel):
    vehicles: list[PushAck] = Field(default_factory=list)
    sessions: list[PushAck] = Field(default_factory=list)
    messages: list[PushAck] = Field(default_factory=list)
    tool_calls: list[PushAck] = Field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────────────
# Pull — server → client
# ──────────────────────────────────────────────────────────────────────────────


class VehiclePull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    make: str | None
    model: str | None
    year: int | None
    vin: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class SessionPull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    vehicle_id: str | None
    created_at: datetime


class MessagePull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime


class ToolCallPull(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    message_id: str
    tool_name: str
    input: str
    output: str | None
    created_at: datetime


class PullResponse(BaseModel):
    """Cursor (`server_time`) is a single ISO timestamp covering all entities.

    The client persists it and sends it back as `since` on the next pull,
    so any row touched up to that moment is guaranteed to appear at most
    once across calls.
    """

    vehicles: list[VehiclePull] = Field(default_factory=list)
    sessions: list[SessionPull] = Field(default_factory=list)
    messages: list[MessagePull] = Field(default_factory=list)
    tool_calls: list[ToolCallPull] = Field(default_factory=list)
    server_time: datetime
