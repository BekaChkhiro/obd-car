from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class AuthFrame(BaseModel):
    type: Literal["auth"]
    token: str


class RegisterFrame(BaseModel):
    type: Literal["register"]
    supported_pids: list[str] = []
    vin: str | None = None
    locale: str = "en"
