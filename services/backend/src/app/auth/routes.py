from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import User
from ..security import (
    GoogleAuthError,
    hash_password,
    verify_google_id_token,
    verify_password,
)
from .dependencies import get_current_user
from .rate_limit import AUTH_RATE_LIMIT, limiter
from .schemas import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserPublic,
)
from .service import auth_response, consume_refresh_token, issue_token_pair

router = APIRouter(prefix="/auth", tags=["auth"])


def _bad_credentials() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_RATE_LIMIT)
async def register(
    request: Request,
    body: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    email = body.email.lower()
    existing = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="email already registered"
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        locale=body.locale or "en",
    )
    session.add(user)
    await session.flush()
    tokens = await issue_token_pair(session, user)
    return auth_response(user, tokens)


@router.post("/login", response_model=AuthResponse)
@limiter.limit(AUTH_RATE_LIMIT)
async def login(
    request: Request,
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    email = body.email.lower()
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if user is None or not user.password_hash:
        raise _bad_credentials()
    if not verify_password(body.password, user.password_hash):
        raise _bad_credentials()

    tokens = await issue_token_pair(session, user)
    return auth_response(user, tokens)


@router.post("/google", response_model=AuthResponse)
@limiter.limit(AUTH_RATE_LIMIT)
async def google_sign_in(
    request: Request,
    body: GoogleAuthRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    try:
        claims = verify_google_id_token(body.id_token)
    except GoogleAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"google auth failed: {exc}"
        ) from exc

    sub = claims["sub"]
    email = claims["email"].lower()
    locale = claims.get("locale") or "en"

    user = (
        await session.execute(select(User).where(User.google_sub == sub))
    ).scalar_one_or_none()
    if user is None:
        # Link to existing email-registered account if present, else create.
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            user = User(email=email, google_sub=sub, locale=locale)
            session.add(user)
            await session.flush()
        else:
            user.google_sub = sub
            await session.flush()

    tokens = await issue_token_pair(session, user)
    return auth_response(user, tokens)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(AUTH_RATE_LIMIT)
async def refresh(
    request: Request,
    body: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenPair:
    try:
        user = await consume_refresh_token(session, body.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    return await issue_token_pair(session, user)


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)
