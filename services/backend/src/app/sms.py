"""Outbound SMS via sender.ge.

One seam with two implementations: sender.ge when an API key is configured,
and a log line when it is not. Development therefore works with no account
and no balance, and the code that calls this does not change when the key
arrives.

The log fallback exists so a missing key is loud rather than silent — a
verification flow that quietly sends nothing is far worse than one that
visibly cannot send.
"""

from __future__ import annotations

import httpx
import structlog

from .config import settings

log = structlog.get_logger(__name__)

_SENDER_GE_ENDPOINT = "https://sender.ge/api/send.php"

# sender.ge is between the user and their account, so it gets one short
# attempt. A slow provider must not hold the request open.
_TIMEOUT_SECONDS = 8.0


class SmsError(RuntimeError):
    """Delivery failed. Callers decide whether the user should be told."""


async def send_sms(*, to: str, text: str) -> None:
    """Send one SMS, or log it when no provider is configured.

    `to` is E.164 (`+9955XXXXXXXX`); sender.ge wants the bare 9-digit
    national number, no country code.
    """
    if not settings.sender_ge_api_key:
        # Not an error: this is the documented development path.
        log.warning("sms_not_configured_logging_instead", to=to, body=text)
        return

    destination = to.removeprefix("+995")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.post(
                _SENDER_GE_ENDPOINT,
                data={
                    "apikey": settings.sender_ge_api_key,
                    "smsno": "2",  # informational — no advertising SmsNo for a code
                    "destination": destination,
                    "content": text,
                    # Skip the SMS-subscription check: a verification code must
                    # not be suppressed because the recipient opted out of
                    # marketing messages.
                    "priority": "1",
                },
            )
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - provider errors are all handled alike
        log.error("sms_send_failed", to=to, error=str(exc))
        raise SmsError(str(exc)) from exc


def verification_message(code: str, minutes: int) -> str:
    """Plain-text body for a verification code.

    SMS has no separate subject line and often a length cap on the segment a
    carrier will bill as one message, so this stays to one short sentence.
    """
    return f"Your OBD Car verification code is {code}. It expires in {minutes} minutes."
