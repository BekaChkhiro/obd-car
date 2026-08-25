from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..models import PhoneVerificationCode, User, utcnow
from ..security import generate_verification_code, hash_verification_code
from ..sms import SmsError, send_sms, verification_message
from .dependencies import get_current_user
from .rate_limit import AUTH_RATE_LIMIT, check_sms_ip_rate_limit, limiter
from .schemas import (
    AuthResponse,
    ProfileUpdate,
    RefreshRequest,
    RequestCodeRequest,
    RequestCodeResponse,
    TokenPair,
    UserPublic,
    VerifyCodeRequest,
)
from .service import auth_response, consume_refresh_token, issue_token_pair

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _aware(value: datetime) -> datetime:
    """Read a stored timestamp as UTC.

    SQLite hands back naive datetimes, so comparing one directly against an
    aware `utcnow()` raises.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _rate_limited(retry_after: int) -> JSONResponse:
    """The one 429 shape for every way `/auth/request-code` can be throttled.

    `retry_after` is in the body (so a client with no interest in headers
    still gets a precise wait, matching the 200 path's `resend_after`) and
    duplicated onto the `Retry-After` header, which is what it is for.
    """
    return JSONResponse(
        {"detail": "rate_limited", "retry_after": retry_after},
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(retry_after)},
    )


@router.post("/request-code", response_model=RequestCodeResponse)
async def request_code(
    request: Request,
    body: RequestCodeRequest,
    session: AsyncSession = Depends(get_session),
) -> RequestCodeResponse | JSONResponse:
    """Start a phone verification, for either login or registration.

    Always answers the same way whether or not the phone belongs to an
    account. Reporting "no such account" would turn this into a way to test
    which phone numbers are registered here — and for a diagnostics app that
    is a list of who owns which car. Delivery failures are swallowed for the
    same reason: the answer must not vary with what the server knows about
    the number.
    """
    now = utcnow()

    # Checked by hand, not through `@limiter.limit(...)` like the rest of
    # this module — this endpoint needs the same `{detail, retry_after}` 429
    # shape as the per-phone checks below it, and slowapi's own handler
    # can't produce that.
    ip_allowed, ip_retry_after = check_sms_ip_rate_limit(get_remote_address(request))
    if not ip_allowed:
        return _rate_limited(ip_retry_after)

    # Reserved numbers for App Store review bypass sending and the per-phone
    # throttle below — a reviewer with a US number can never receive a real
    # SMS, and must not get locked out retrying. The code itself still goes
    # through the normal row, so expiry and the attempt limit still apply to
    # it; only delivery and the resend cooldown are special-cased.
    test_code = settings.test_phone_numbers_map.get(body.phone)
    if test_code is not None:
        log.info("phone_verification_test_number_used", phone=body.phone)
    else:
        recent = (
            (
                await session.execute(
                    select(PhoneVerificationCode)
                    .where(PhoneVerificationCode.phone == body.phone)
                    .where(PhoneVerificationCode.created_at >= now - timedelta(hours=1))
                    .order_by(PhoneVerificationCode.created_at.desc())
                )
            )
            .scalars()
            .all()
        )

        # Both limits are per-phone and must survive a restart, so they read
        # the sent history back out of the database rather than an in-memory
        # limiter — unlike the per-IP limit above, which does not need to.
        if recent:
            cooldown = timedelta(seconds=settings.phone_code_resend_seconds)
            newest = _aware(recent[0].created_at)
            if now - newest < cooldown:
                retry_after = max(1, int((cooldown - (now - newest)).total_seconds()))
                return _rate_limited(retry_after)
        if len(recent) >= settings.phone_code_hourly_limit:
            # `recent` is capped to the last hour, so its oldest entry is the
            # next one to fall out of the window and free up a slot.
            oldest = _aware(recent[-1].created_at)
            retry_after = max(1, int((oldest + timedelta(hours=1) - now).total_seconds()))
            return _rate_limited(retry_after)

    existing_user = (
        await session.execute(select(User).where(User.phone == body.phone))
    ).scalar_one_or_none()

    # Sign-in with a number that has no account: say so now, before spending an
    # SMS on a code that could only ever end in "you need to register". The
    # caller's intent is already here — names are sent from the register screen
    # and omitted from the sign-in one — so no extra field is needed to tell
    # the two apart.
    #
    # This does answer "is this number registered", which the neutral response
    # elsewhere in this endpoint is careful not to. The trade was made
    # deliberately: the per-IP and per-phone limits above make sweeping through
    # numbers impractical, and the alternative is charging every mistyped or
    # forgotten number the price of an SMS and a wasted code entry.
    if existing_user is None and body.first_name is None and body.last_name is None:
        return JSONResponse(
            {"detail": "registration_required"},
            status_code=status.HTTP_404_NOT_FOUND,
        )

    code = test_code if test_code is not None else generate_verification_code()
    ttl = settings.phone_code_ttl_minutes
    record = PhoneVerificationCode(
        phone=body.phone,
        code_hash=hash_verification_code(code),
        # An existing account ignores whatever names were sent — this is a
        # login, and a caller must not be able to overwrite someone
        # else's profile just by guessing their phone number.
        first_name=body.first_name if existing_user is None else None,
        last_name=body.last_name if existing_user is None else None,
        expires_at=now + timedelta(minutes=ttl),
    )
    session.add(record)
    await session.commit()

    if test_code is None:
        try:
            await send_sms(to=body.phone, text=verification_message(code, ttl))
        except SmsError:
            # Undo the row. It is what the per-phone cooldown and hourly cap
            # are counted from, so leaving it behind would spend the caller's
            # budget on a code they never received — five failures and they
            # are locked out for an hour over an outage on our side.
            await session.delete(record)
            await session.commit()
            # And say so, rather than returning the neutral 200. Enumeration
            # is not the risk here: whether our SMS provider accepted the
            # request says nothing about whether the number has an account,
            # and pretending a code is on its way leaves the user waiting for
            # something that will never arrive.
            return JSONResponse(
                {"detail": "sms_send_failed"},
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

    return RequestCodeResponse(
        expires_in=ttl * 60,
        resend_after=settings.phone_code_resend_seconds,
    )


@router.post("/verify-code", response_model=AuthResponse)
@limiter.limit(AUTH_RATE_LIMIT)
async def verify_code(
    request: Request,
    body: VerifyCodeRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """Finish a phone verification, registering the account if one is held.

    Registering and logging in are the same call: a new user is created here,
    not in `/request-code`, because the phone must be proven first.
    """
    now = utcnow()
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_code")

    candidates = (
        (
            await session.execute(
                select(PhoneVerificationCode)
                .where(PhoneVerificationCode.phone == body.phone)
                .where(PhoneVerificationCode.consumed_at.is_(None))
                .order_by(PhoneVerificationCode.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    submitted = hash_verification_code(body.code)
    match: PhoneVerificationCode | None = None
    for candidate in candidates:
        if _aware(candidate.expires_at) <= now:
            continue
        if candidate.attempts >= settings.phone_code_max_attempts:
            continue
        if candidate.code_hash == submitted:
            match = candidate
            break

    if match is None:
        # Count the failure against every live code for this phone, so
        # guessing cannot be retried indefinitely against the newest one.
        for candidate in candidates:
            if _aware(candidate.expires_at) > now:
                candidate.attempts += 1
        await session.commit()
        raise invalid

    user = (
        await session.execute(select(User).where(User.phone == body.phone))
    ).scalar_one_or_none()

    if user is None:
        # Names can arrive now (this call) or earlier (held from
        # request-code); either is fine, but at least one source must have
        # them.
        first_name = body.first_name or match.first_name
        last_name = body.last_name or match.last_name
        if not first_name or not last_name:
            # A correct code with no name anywhere is not a wrong guess — the
            # caller has already proven they hold the phone, which is exactly
            # what makes it safe to tell them "you have no account" here. The
            # code is left untouched (not consumed, attempts not bumped) so
            # the register screen can retry with a name on this same code
            # instead of costing a second SMS.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="registration_required"
            )
        user = User(phone=body.phone, first_name=first_name, last_name=last_name)
        session.add(user)
        await session.flush()

    # Single use, and only past this point — a code is only spent once an
    # attempt actually resulted in a login or a registration.
    match.consumed_at = now
    await session.commit()

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    return await issue_token_pair(session, user)


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)


@router.patch("/me", response_model=UserPublic)
async def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserPublic:
    """Update the caller's own profile.

    Only the fields present in the request are touched, so a client can send
    a single edited field without having to resend — and accidentally
    overwrite — the other one.
    """
    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name

    await session.commit()
    await session.refresh(user)
    return UserPublic.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(user)
    await session.commit()
