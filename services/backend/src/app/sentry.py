"""Sentry crash reporting — disabled when SENTRY_DSN is not set.

PII scrubbing: chat message content is stripped from breadcrumbs and
request bodies before events are transmitted.
"""

from __future__ import annotations

from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from .config import settings

_CHAT_BODY_KEYS = frozenset({"content", "messages", "system"})


def _scrub_dict(d: dict[str, Any]) -> dict[str, Any]:
    return {k: "[scrubbed]" if k in _CHAT_BODY_KEYS else v for k, v in d.items()}


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    # Strip chat content from request body so user messages never leave the server.
    try:
        body = event.get("request", {}).get("data")
        if isinstance(body, dict):
            event["request"]["data"] = _scrub_dict(body)
    except Exception:
        pass

    # Scrub breadcrumb messages that could carry chat text.
    for crumb in event.get("breadcrumbs", {}).get("values", []):
        if isinstance(crumb.get("data"), dict):
            crumb["data"] = _scrub_dict(crumb["data"])
        if crumb.get("category") in ("ws.message", "chat"):
            crumb["message"] = "[scrubbed]"

    return event


def init_sentry() -> None:
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=_before_send,
    )
