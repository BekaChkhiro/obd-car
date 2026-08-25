from __future__ import annotations

import re

import pytest

_CODE_RE = re.compile(r"code is (\d{4})")


@pytest.fixture(autouse=True)
def _no_resend_cooldown_by_default(monkeypatch):
    """Most tests re-request a code for the same phone (e.g. register then
    log in) without caring about the resend cooldown — only the tests in the
    "Rate limiting" section below do, and they set a real cooldown themselves.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "phone_code_resend_seconds", 0)


def _extract_code(sms_text: str) -> str:
    match = _CODE_RE.search(sms_text)
    assert match, f"no code found in SMS body: {sms_text!r}"
    return match.group(1)


@pytest.fixture
def sent_codes(monkeypatch):
    """Capture the code the SMS sender was asked to deliver, without sending it."""
    codes: list[str] = []

    async def fake_send(*, to: str, text: str) -> None:
        codes.append(_extract_code(text))

    from app.auth import routes as auth_routes

    monkeypatch.setattr(auth_routes, "send_sms", fake_send)
    return codes


async def _request_code(
    client, phone: str, first_name: str | None = "Test", last_name: str | None = "User"
):
    """Ask for a code the way the register screen does.

    Names default to present because that is what makes this work on a number
    with no account: omitting them is the sign-in path, which now answers 404
    rather than sending a code nobody could use. Tests that exercise sign-in
    pass `None` explicitly or call the endpoint directly.
    """
    payload: dict[str, str] = {"phone": phone}
    if first_name is not None:
        payload["first_name"] = first_name
    if last_name is not None:
        payload["last_name"] = last_name
    resp = await client.post("/auth/request-code", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _register(client, sent_codes, phone: str, first_name: str, last_name: str):
    await _request_code(client, phone, first_name, last_name)
    resp = await client.post("/auth/verify-code", json={"phone": phone, "code": sent_codes[-1]})
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Registration and login ───────────────────────────────────────────────────


async def test_happy_register_creates_account_and_returns_tokens(client, sent_codes):
    body = await _register(client, sent_codes, "+995555111111", "Nino", "Beridze")

    assert body["user"]["phone"] == "+995555111111"
    assert body["user"]["first_name"] == "Nino"
    assert body["user"]["last_name"] == "Beridze"
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]

    resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {body['tokens']['access_token']}"}
    )
    assert resp.status_code == 200
    assert resp.json()["phone"] == "+995555111111"


async def test_happy_login_returns_the_same_account(client, sent_codes):
    registered = await _register(client, sent_codes, "+995555222222", "Data", "Ai")

    await _request_code(client, "+995555222222")
    resp = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555222222", "code": sent_codes[-1]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == registered["user"]["id"]


async def test_login_ignores_names_sent_for_an_existing_account(client, sent_codes):
    await _register(client, sent_codes, "+995555333333", "Original", "Name")

    # Sending different names on a login attempt must not overwrite the
    # account — an attacker who only knows the phone number could otherwise
    # rename someone else's profile.
    await _request_code(client, "+995555333333", "Someone", "Else")
    resp = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555333333", "code": sent_codes[-1]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["first_name"] == "Original"
    assert resp.json()["user"]["last_name"] == "Name"


async def _nameless_code_for_a_vanished_account(client, sent_codes, phone: str) -> str:
    """Produce the one situation `verify-code` can still answer 409 for.

    `request-code` now rejects a nameless request for an unknown number
    outright, so a code with no names attached can only outlive its account —
    which happens when the account is deleted between the two calls.
    """
    auth = await _register(client, sent_codes, phone, "Temp", "Account")
    resp = await client.post("/auth/request-code", json={"phone": phone})
    assert resp.status_code == 200, resp.text
    code = sent_codes[-1]

    token = auth["tokens"]["access_token"]
    resp = await client.delete("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204, resp.text
    return code


async def test_unknown_phone_without_names_requires_registration(client, sent_codes):
    code = await _nameless_code_for_a_vanished_account(client, sent_codes, "+995555444444")
    resp = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555444444", "code": code},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "registration_required"


async def test_409_does_not_consume_the_code_or_touch_attempts(client, sent_codes, session_factory):
    """A correct code for a nameless phone is not a wrong guess.

    Consuming it or counting it as a failed attempt would force a second SMS
    just to finish signing up — which is exactly the waste this design avoids.
    """
    from sqlalchemy import select

    from app.models import PhoneVerificationCode

    code = await _nameless_code_for_a_vanished_account(client, sent_codes, "+995555454545")

    resp = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555454545", "code": code},
    )
    assert resp.status_code == 409

    async with session_factory() as session:
        # The helper registers first, so there are two rows for this phone;
        # the one under test is the nameless code that outlived the account.
        row = (
            await session.execute(
                select(PhoneVerificationCode)
                .where(PhoneVerificationCode.phone == "+995555454545")
                .order_by(PhoneVerificationCode.created_at.desc())
            )
        ).scalars().first()
        assert row is not None
        assert row.consumed_at is None
        assert row.attempts == 0
        code_hash = row.code_hash

    # Same code, now with a name attached, registers — no second SMS needed.
    resp = await client.post(
        "/auth/verify-code",
        json={
            "phone": "+995555454545",
            "code": sent_codes[-1],
            "first_name": "Nino",
            "last_name": "Beridze",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["first_name"] == "Nino"

    async with session_factory() as session:
        row = (
            await session.execute(
                select(PhoneVerificationCode).where(PhoneVerificationCode.code_hash == code_hash)
            )
        ).scalar_one()
        assert row.consumed_at is not None


async def test_409_then_retry_with_only_first_name_still_requires_last_name(client, sent_codes):
    code = await _nameless_code_for_a_vanished_account(client, sent_codes, "+995555464646")

    first = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555464646", "code": code, "first_name": "Nino"},
    )
    assert first.status_code == 409

    second = await client.post(
        "/auth/verify-code",
        json={
            "phone": "+995555464646",
            "code": code,
            "first_name": "Nino",
            "last_name": "Beridze",
        },
    )
    assert second.status_code == 200, second.text


# ── Code correctness ─────────────────────────────────────────────────────────


async def test_wrong_code_is_refused(client, sent_codes):
    await _request_code(client, "+995555555555", "Beka", "Test")
    real = sent_codes[-1]
    wrong = "1111" if real != "1111" else "2222"

    resp = await client.post("/auth/verify-code", json={"phone": "+995555555555", "code": wrong})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_code"


async def test_expired_code_is_refused(client, sent_codes, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "phone_code_ttl_minutes", -1)
    await _request_code(client, "+995555666666", "Beka", "Test")

    resp = await client.post(
        "/auth/verify-code",
        json={"phone": "+995555666666", "code": sent_codes[-1]},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_code"


async def test_a_code_cannot_be_used_twice(client, sent_codes):
    await _register(client, sent_codes, "+995555777777", "Beka", "Test")
    code = sent_codes[-1]

    resp = await client.post("/auth/verify-code", json={"phone": "+995555777777", "code": code})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_code"


async def test_guessing_is_capped(client, sent_codes, monkeypatch):
    """A four-digit code is only safe because guesses run out."""
    from app.config import settings

    monkeypatch.setattr(settings, "phone_code_max_attempts", 3)

    await _request_code(client, "+995555888888", "Beka", "Test")
    real = sent_codes[-1]
    wrong = "1111" if real != "1111" else "2222"

    for _ in range(3):
        await client.post("/auth/verify-code", json={"phone": "+995555888888", "code": wrong})

    # Even the correct code is dead once the attempts are spent.
    resp = await client.post("/auth/verify-code", json={"phone": "+995555888888", "code": real})
    assert resp.status_code == 401


# ── Rate limiting ─────────────────────────────────────────────────────────────


def _assert_rate_limited(resp) -> int:
    """Every 429 from `/auth/request-code` has the same body and header shape."""
    assert resp.status_code == 429
    body = resp.json()
    assert body["detail"] == "rate_limited"
    assert isinstance(body["retry_after"], int)
    assert body["retry_after"] > 0
    assert resp.headers["retry-after"] == str(body["retry_after"])
    return body["retry_after"]


async def test_resend_before_cooldown_is_refused(client, sent_codes, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "phone_code_resend_seconds", 60)
    await _request_code(client, "+995555999999", "Beka", "Test")

    resp = await client.post(
        "/auth/request-code", json={"phone": "+995555999999", "first_name": "Beka"}
    )
    retry_after = _assert_rate_limited(resp)
    assert retry_after <= settings.phone_code_resend_seconds


async def test_hourly_cap_is_enforced_once_cooldown_is_out_of_the_way(
    client, sent_codes, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "phone_code_resend_seconds", 0)
    monkeypatch.setattr(settings, "phone_code_hourly_limit", 2)

    await _request_code(client, "+995555100100", "Beka", "Test")
    await _request_code(client, "+995555100100")

    resp = await client.post("/auth/request-code", json={"phone": "+995555100100"})
    retry_after = _assert_rate_limited(resp)
    assert retry_after <= 3600


async def test_ip_cap_is_enforced_with_the_same_body_shape(client, sent_codes, monkeypatch):
    from limits.storage import MemoryStorage
    from limits.strategies import MovingWindowRateLimiter

    from app.auth import rate_limit as rl_module

    # A fresh, isolated counter — the real one is a process-wide singleton
    # shared with every other test in this file, so reusing it here would
    # make the outcome depend on how many requests already ran.
    monkeypatch.setattr(rl_module.settings, "sms_request_ip_rate_limit", "2/hour")
    monkeypatch.setattr(rl_module, "_sms_ip_storage", MemoryStorage())
    monkeypatch.setattr(
        rl_module, "_sms_ip_limiter", MovingWindowRateLimiter(rl_module._sms_ip_storage)
    )

    # Distinct phones so this is only ever the IP limit firing, not the
    # per-phone cooldown or hourly cap.
    await _request_code(client, "+995555200200", "Beka", "Test")
    await _request_code(client, "+995555200300", "Beka", "Test")

    resp = await client.post(
        "/auth/request-code", json={"phone": "+995555200400", "first_name": "Beka"}
    )
    retry_after = _assert_rate_limited(resp)
    assert retry_after <= 3600


# ── Phone normalisation ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "typed_form",
    ["555987654", "995555987654", "+995555987654", "+995 555-987-654"],
)
async def test_phone_normalisation_accepts_all_input_forms(client, sent_codes, typed_form):
    await _register(client, sent_codes, "+995555987654", "Nino", "Beridze")

    await _request_code(client, typed_form)
    resp = await client.post(
        "/auth/verify-code", json={"phone": typed_form, "code": sent_codes[-1]}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["phone"] == "+995555987654"


@pytest.mark.parametrize(
    "bad_number",
    ["+1 555 123 4567", "12345", "+995444123456"],
)
async def test_non_georgian_number_is_rejected(client, bad_number):
    resp = await client.post("/auth/request-code", json={"phone": bad_number})
    assert resp.status_code == 422


# ── SMS delivery ──────────────────────────────────────────────────────────────


async def test_sms_body_contains_the_code_when_a_key_is_configured(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "sender_ge_api_key", "test-key")

    calls: list[dict] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            pass

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info) -> bool:
            return False

        async def post(self, url, *, data=None, **kwargs):
            calls.append({"url": url, "data": data})
            return FakeResponse()

    class FakeHttpx:
        AsyncClient = FakeAsyncClient

    # Patched on `app.sms`'s own `httpx` binding, not the real `httpx`
    # package — the latter is shared with the test client's own AsyncClient,
    # and patching it there would break every request this test makes.
    monkeypatch.setattr("app.sms.httpx", FakeHttpx())

    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555121212", "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 200, resp.text

    assert len(calls) == 1
    assert calls[0]["url"] == "https://sender.ge/api/send.php"
    body = calls[0]["data"]
    assert body["apikey"] == "test-key"
    assert body["destination"] == "555121212"
    assert body["priority"] == "1"
    assert _CODE_RE.search(body["content"]) is not None


async def test_sms_not_configured_does_not_raise(client, sent_codes):
    """No API key is the documented development path, not a failure."""
    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555131313", "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 200
    assert sent_codes  # the log-fallback path still hands the code to the caller


# ── Refresh / me / delete (unchanged surface) ─────────────────────────────────


async def test_refresh_rotates_tokens_and_revokes_old(client, sent_codes):
    body = await _register(client, sent_codes, "+995555141414", "Beka", "Test")
    refresh_token = body["tokens"]["refresh_token"]

    r1 = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r1.status_code == 200, r1.text
    assert r1.json()["refresh_token"] != refresh_token

    r2 = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 401


async def test_me_requires_bearer(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_profile_update_edits_first_and_last_name_only(client, sent_codes):
    body = await _register(client, sent_codes, "+995555151515", "Beka", "Test")
    auth = {"Authorization": f"Bearer {body['tokens']['access_token']}"}

    r = await client.patch("/auth/me", json={"first_name": "Bekhan"}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["first_name"] == "Bekhan"
    assert r.json()["last_name"] == "Test"


async def test_profile_update_rejects_empty_name(client, sent_codes):
    body = await _register(client, sent_codes, "+995555161616", "Beka", "Test")
    auth = {"Authorization": f"Bearer {body['tokens']['access_token']}"}

    r = await client.patch("/auth/me", json={"first_name": "   "}, headers=auth)
    assert r.status_code == 422


async def test_delete_account_removes_user_and_returns_204(client, sent_codes):
    body = await _register(client, sent_codes, "+995555171717", "Beka", "Test")
    access = body["tokens"]["access_token"]

    resp = await client.delete("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 204

    # The number is unknown again, so signing in with it is refused up front
    # rather than after a code the user could not have used.
    resp = await client.post("/auth/request-code", json={"phone": "+995555171717"})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "registration_required"


# ── Reserved test numbers (App Store review) ──────────────────────────────────
#
# Apple's reviewers have US numbers; sender.ge only delivers to Georgian ones,
# and phone auth is the only way into the app. Without a reserved number with
# a fixed code, review is an automatic Guideline 2.1 rejection.


def _no_sms_client(monkeypatch):
    """Fail the test if `send_sms` is ever called — used by the test-number path."""

    async def fail_send(*, to: str, text: str) -> None:
        raise AssertionError(f"send_sms must not be called for a test number, got to={to!r}")

    from app.auth import routes as auth_routes

    monkeypatch.setattr(auth_routes, "send_sms", fail_send)


async def test_empty_test_phone_numbers_means_no_test_numbers(client):
    from app.config import settings

    assert settings.test_phone_numbers == ""
    assert settings.test_phone_numbers_map == {}


async def test_test_number_gets_the_fixed_code_and_skips_sender_ge(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "test_phone_numbers", "+995555000001:7483")
    _no_sms_client(monkeypatch)

    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555000001", "first_name": "Review", "last_name": "Er"},
    )
    assert resp.status_code == 200, resp.text
    # Byte-identical to the normal-path response shape.
    assert set(resp.json()) == {"expires_in", "resend_after"}

    # The fixed code from config verifies, without ever going through send_sms.
    verify = await client.post("/auth/verify-code", json={"phone": "+995555000001", "code": "7483"})
    assert verify.status_code == 200, verify.text


async def test_a_would_be_test_number_takes_the_normal_path_when_config_is_empty(
    client, sent_codes
):
    """The literal number from the docs must not work unless configured."""
    from app.config import settings

    assert settings.test_phone_numbers_map == {}

    body = await _register(client, sent_codes, "+995555000001", "Review", "Er")
    assert body["user"]["phone"] == "+995555000001"
    # A real (random) code was generated and delivered through the normal
    # log/send path — `sent_codes` only has an entry because `send_sms` ran.
    assert sent_codes


async def test_registration_completes_through_a_test_number(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "test_phone_numbers", "+995555000002:9137")
    _no_sms_client(monkeypatch)

    await client.post(
        "/auth/request-code",
        json={"phone": "+995555000002", "first_name": "Review", "last_name": "Er"},
    )
    resp = await client.post("/auth/verify-code", json={"phone": "+995555000002", "code": "9137"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["first_name"] == "Review"
    assert resp.json()["user"]["phone"] == "+995555000002"


async def test_test_number_attempt_limit_still_applies(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "test_phone_numbers", "+995555000003:9137")
    monkeypatch.setattr(settings, "phone_code_max_attempts", 3)
    _no_sms_client(monkeypatch)

    await client.post(
        "/auth/request-code",
        json={"phone": "+995555000003", "first_name": "Review", "last_name": "Er"},
    )

    for _ in range(3):
        r = await client.post("/auth/verify-code", json={"phone": "+995555000003", "code": "0000"})
        assert r.status_code == 401

    # Even the correct, fixed code is dead once the attempts are spent — a
    # reserved number is not exempt from the guess limit, only from delivery.
    resp = await client.post("/auth/verify-code", json={"phone": "+995555000003", "code": "9137"})
    assert resp.status_code == 401


async def test_test_number_skips_the_resend_cooldown(client, monkeypatch):
    from app.config import settings

    # A real cooldown, so this actually proves the test number skips it
    # rather than the autouse fixture having already disabled it for everyone.
    monkeypatch.setattr(settings, "phone_code_resend_seconds", 60)
    monkeypatch.setattr(settings, "test_phone_numbers", "+995555000004:6215")
    _no_sms_client(monkeypatch)

    first = await client.post(
        "/auth/request-code",
        json={"phone": "+995555000004", "first_name": "Review", "last_name": "Er"},
    )
    assert first.status_code == 200

    # A real number would get 429 here (see test_resend_before_cooldown_is_refused).
    second = await client.post(
        "/auth/request-code",
        json={"phone": "+995555000004", "first_name": "Review", "last_name": "Er"},
    )
    assert second.status_code == 200


def _failing_sms(monkeypatch) -> None:
    """Make every send raise, the way an outage or a rejected key does."""
    from app.config import settings
    from app.sms import SmsError

    monkeypatch.setattr(settings, "sender_ge_api_key", "test-key")

    async def boom(*args, **kwargs):
        raise SmsError("provider said no")

    monkeypatch.setattr("app.sms._post_sms", boom, raising=False)
    monkeypatch.setattr("app.auth.routes.send_sms", boom)


async def test_send_failure_is_reported_rather_than_answered_with_a_neutral_200(
    client, monkeypatch
):
    """A code that was never sent must not look like one that is on its way.

    Answering 200 leaves the user staring at a code entry screen waiting for
    an SMS that does not exist, with the resend button counting down.
    """
    _failing_sms(monkeypatch)

    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555141414", "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == "sms_send_failed"


async def test_send_failure_does_not_spend_the_callers_rate_limit_budget(
    client, monkeypatch, sent_codes
):
    """Otherwise an outage on our side locks the user out for an hour.

    The hourly cap is counted from stored code rows, so a failed send that
    left its row behind would burn one of five attempts for nothing — and the
    cooldown would make them wait a minute between each.
    """
    _failing_sms(monkeypatch)

    phone = "+995555151515"
    for _ in range(6):
        resp = await client.post(
            "/auth/request-code",
            json={"phone": phone, "first_name": "Nino", "last_name": "B"},
        )
        # Never 429: no failed attempt should count against either limit.
        assert resp.status_code == 502, resp.text

    # And once delivery recovers, the very next request goes through — no
    # cooldown inherited from the failures. Replaced with a working stub
    # rather than `monkeypatch.undo()`: that would also restore the real
    # sender, and a developer with a live key in `.env` would have this test
    # send actual SMS.
    async def ok(*args, **kwargs):
        return None

    monkeypatch.setattr("app.auth.routes.send_sms", ok)
    resp = await client.post(
        "/auth/request-code",
        json={"phone": phone, "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 200, resp.text


async def test_sign_in_with_an_unregistered_number_says_so_without_sending(
    client, sent_codes
):
    """No names means the sign-in screen, and a code there would be wasted.

    The user can only ever be told to register once the code arrives, so
    telling them now saves an SMS and a round trip through code entry.
    """
    before = len(sent_codes)
    resp = await client.post("/auth/request-code", json={"phone": "+995555161616"})
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "registration_required"
    assert len(sent_codes) == before  # nothing was sent


async def test_registering_the_same_unknown_number_still_works(client, sent_codes):
    """The early 404 must not block the register screen, which does send names."""
    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555171717", "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 200, resp.text
    assert sent_codes


async def test_the_early_404_does_not_consume_the_rate_limit(client):
    """A mistyped number must not cost the user their hourly budget."""
    for _ in range(8):
        resp = await client.post("/auth/request-code", json={"phone": "+995555181818"})
        assert resp.status_code == 404, resp.text


async def test_sign_in_on_a_registered_number_still_sends(client, sent_codes):
    resp = await client.post(
        "/auth/request-code",
        json={"phone": "+995555191919", "first_name": "Nino", "last_name": "B"},
    )
    assert resp.status_code == 200
    code = sent_codes[-1]
    assert (
        await client.post(
            "/auth/verify-code", json={"phone": "+995555191919", "code": code}
        )
    ).status_code == 200

    # Now a plain sign-in: the account exists, so no names are needed.
    resp = await client.post("/auth/request-code", json={"phone": "+995555191919"})
    assert resp.status_code in (200, 429), resp.text
