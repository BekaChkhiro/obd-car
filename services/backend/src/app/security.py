"""JWT issuance/verification and phone-verification-code hashing."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from .config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


# ---------- JWT ----------


class TokenError(Exception):
    """Raised when a JWT is invalid, expired, or has the wrong type."""


def _require_secret() -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return settings.jwt_secret


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, _require_secret(), algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_access_ttl_minutes)).timestamp()),
    }
    return _encode(payload)


def create_refresh_token(user_id: int) -> tuple[str, datetime]:
    """Return (raw_refresh_token, expires_at).

    The raw token is opaque to JWT; we store its SHA-256 hash server-side so
    that even DB exposure cannot reissue tokens. Rotation revokes the old one
    and issues a new opaque secret.
    """
    expires_at = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_ttl_days)
    raw = secrets.token_urlsafe(48)
    # Prefix with user id for traceability — the secret part is what matters.
    return f"{user_id}.{raw}", expires_at


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _require_secret(), algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid token") from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise TokenError("wrong token type")
    if "sub" not in payload:
        raise TokenError("missing subject")
    return payload


# ---------- Phone verification codes ----------

# Four digits is short enough to read off an SMS and retype, which is the
# whole point of a code rather than a link. It is only safe because the code
# is single-use, short-lived and dies after a few wrong guesses — see
# PhoneVerificationCode.
_VERIFICATION_CODE_DIGITS = 4


def generate_verification_code() -> str:
    """A cryptographically random numeric code.

    `secrets`, not `random`: the latter is seeded predictably and would make
    codes guessable from one another.
    """
    upper = 10**_VERIFICATION_CODE_DIGITS
    return str(secrets.randbelow(upper)).zfill(_VERIFICATION_CODE_DIGITS)


def hash_verification_code(code: str) -> str:
    """Hash a verification code for storage, exactly as refresh tokens are handled.

    SHA-256, not bcrypt: the code is a random secret we generated (like a
    refresh token), not a human-chosen password — there is nothing for a slow
    hash to protect against that the attempt limit does not already cover.
    """
    return hashlib.sha256(code.encode("utf-8")).hexdigest()
