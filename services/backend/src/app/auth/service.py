"""Auth helpers shared between routes — token issuance + refresh rotation."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import RefreshToken, User
from ..security import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
)
from .schemas import AuthResponse, TokenPair, UserPublic


async def issue_token_pair(session: AsyncSession, user: User) -> TokenPair:
    access = create_access_token(user.id)
    raw_refresh, expires_at = create_refresh_token(user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=expires_at,
        )
    )
    await session.commit()
    return TokenPair(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.jwt_access_ttl_minutes * 60,
    )


def auth_response(user: User, tokens: TokenPair) -> AuthResponse:
    return AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)


async def consume_refresh_token(session: AsyncSession, raw_token: str) -> User:
    """Validate a refresh token, revoke it, and return the owning user.

    Raises ValueError on any failure. Caller should map to 401.
    """
    token_hash = hash_refresh_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None:
        raise ValueError("invalid refresh token")
    if record.revoked_at is not None:
        raise ValueError("refresh token revoked")
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        raise ValueError("refresh token expired")

    record.revoked_at = datetime.now(UTC)
    await session.flush()

    user = await session.get(User, record.user_id)
    if user is None:
        raise ValueError("user not found")
    return user
