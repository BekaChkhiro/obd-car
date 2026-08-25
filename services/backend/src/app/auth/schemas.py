from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .phone import PhoneNumberError, normalize_georgian_phone


def _validate_phone(value: str) -> str:
    try:
        return normalize_georgian_phone(value)
    except PhoneNumberError as exc:
        raise ValueError(str(exc)) from exc


def _strip_optional_name(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class RequestCodeRequest(BaseModel):
    """Start either registration or login — the server decides which.

    `first_name`/`last_name` are optional here too: they can arrive later, on
    `verify-code`, once the phone has been proven — see `VerifyCodeRequest`.
    If the phone already has an account this is a login and any names sent
    are ignored, so the caller does not need to know in advance which case
    it is.
    """

    phone: str
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)

    _normalize_phone = field_validator("phone")(_validate_phone)
    _strip_first_name = field_validator("first_name")(_strip_optional_name)
    _strip_last_name = field_validator("last_name")(_strip_optional_name)


class VerifyCodeRequest(BaseModel):
    """Finish a phone verification.

    `first_name`/`last_name` are only read when the phone turns out to have
    no account and none were held from `request-code` — the code the caller
    already proved they hold is what a late-arriving name gets attached to,
    so registering never needs a second SMS.
    """

    phone: str
    code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)

    _normalize_phone = field_validator("phone")(_validate_phone)
    _strip_first_name = field_validator("first_name")(_strip_optional_name)
    _strip_last_name = field_validator("last_name")(_strip_optional_name)


class RequestCodeResponse(BaseModel):
    expires_in: int  # seconds until the code expires
    resend_after: int  # seconds the caller must wait before requesting another


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access_token expiry


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phone: str
    first_name: str
    last_name: str
    locale: str
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserPublic
    tokens: TokenPair


class ProfileUpdate(BaseModel):
    """Fields a user may change about themselves.

    Every field is optional and omitted fields are left alone, so a client can
    send only what it edited. Unlike the old display_name, first/last name are
    NOT NULL columns — there is no "cleared" state, so an empty value is
    rejected rather than silently accepted.
    """

    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)

    @field_validator("first_name", "last_name")
    @classmethod
    def _strip_and_require_nonempty(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned
