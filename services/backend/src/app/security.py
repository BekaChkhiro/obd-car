"""Password hashing, JWT issuance/verification, Google ID-token verification."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .config import settings


ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


# ---------- Password hashing ----------


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


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


# ---------- Google ID token ----------


class GoogleAuthError(Exception):
    pass


def verify_google_id_token(token: str) -> dict[str, Any]:
    """Verify a Google ID token and return its claims.

    Raises GoogleAuthError on any verification failure.
    """
    if not settings.google_client_id:
        raise GoogleAuthError("GOOGLE_CLIENT_ID is not configured")
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:
        raise GoogleAuthError(str(exc)) from exc

    if not claims.get("email_verified", False):
        raise GoogleAuthError("email not verified by Google")
    if not claims.get("sub"):
        raise GoogleAuthError("missing subject in Google token")
    if not claims.get("email"):
        raise GoogleAuthError("missing email in Google token")
    return claims
