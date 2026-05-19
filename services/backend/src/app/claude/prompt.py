"""System prompt builder for the OBD-II diagnostic assistant.

Composes a structured system prompt from vehicle context (make, model, VIN,
year), user locale, and recent DTCs. Stable sections are marked as cache
breakpoints so repeated requests with the same vehicle context reuse the
Anthropic prompt cache (5-minute TTL, ~75% cost reduction on the cached
prefix).

Cache strategy
--------------
Block 1 — static role + vehicle context:
    Marked with ``cache_control: ephemeral``. This prefix is reused for
    every turn in the same session (same vehicle, same locale).
Block 2 — recent DTCs (if any):
    Dynamic. No cache breakpoint. Placed after Block 1 so different DTC
    sets don't invalidate the stable vehicle-context cache.

Pass the returned list directly as the ``system=`` argument to
``ClaudeClient.stream(...)``.
"""

from __future__ import annotations

from typing import Any

from .caching import apply_cache_breakpoint

# Display labels for supported locales. Unknown locales fall back to the raw tag.
_LOCALE_LABELS: dict[str, str] = {
    "en": "English",
    "ka": "Georgian (ქართული)",
}

_ROLE_TEXT = (
    "You are an expert automotive diagnostic assistant integrated with an "
    "OBD-II scanner connected to the user's vehicle via Bluetooth. "
    "You have access to live vehicle data through a set of tools: you can "
    "read sensor values (RPM, speed, coolant temperature, fuel level, battery "
    "voltage), retrieve stored and pending Diagnostic Trouble Codes (DTCs), "
    "read permanent DTCs (codes the ECU cannot clear until it self-verifies a fix), "
    "read freeze-frame snapshots captured at the moment a fault was stored, "
    "read the Vehicle Identification Number (VIN) from the ECU, "
    "and — only after explicit user confirmation — clear DTCs. "
    "Diagnose issues, explain fault codes in plain language, and guide the "
    "user through next steps. Never dispatch write operations (such as "
    "clear_dtcs) without first receiving an explicit confirmation from the user."
)


def _vehicle_block_text(
    *,
    make: str | None,
    model: str | None,
    year: int | None,
    vin: str | None,
    locale: str,
) -> str:
    lines: list[str] = [_ROLE_TEXT, ""]

    vehicle_parts: list[str] = []
    if year is not None:
        vehicle_parts.append(str(year))
    if make:
        vehicle_parts.append(make)
    if model:
        vehicle_parts.append(model)

    if vehicle_parts:
        lines.append(f"Vehicle: {' '.join(vehicle_parts)}")
    else:
        lines.append("Vehicle: unknown")

    if vin:
        lines.append(f"VIN: {vin}")

    lang_label = _LOCALE_LABELS.get(locale, locale)
    lines.append(f"Respond in: {lang_label}")

    return "\n".join(lines)


def build_system_prompt(
    *,
    make: str | None = None,
    model: str | None = None,
    year: int | None = None,
    vin: str | None = None,
    locale: str = "en",
    recent_dtcs: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Return a structured system prompt as Anthropic content blocks.

    Parameters
    ----------
    make:
        Vehicle manufacturer (e.g. ``"Toyota"``).
    model:
        Vehicle model name (e.g. ``"Corolla"``).
    year:
        Model year as an integer (e.g. ``2019``).
    vin:
        17-character Vehicle Identification Number, or ``None`` if unknown.
    locale:
        BCP-47 language tag for the response language (``"en"`` or ``"ka"``).
    recent_dtcs:
        List of DTC code strings (e.g. ``["P0300", "P0420"]``) retrieved
        at the start of the session. Pass ``None`` or ``[]`` when no DTCs
        are present.
    """
    blocks: list[dict[str, Any]] = []

    # Block 1: stable role + vehicle context — cache breakpoint here so every
    # turn in the same session reuses this prefix from the Anthropic cache.
    vehicle_text = _vehicle_block_text(
        make=make, model=model, year=year, vin=vin, locale=locale
    )
    blocks.append(apply_cache_breakpoint({"type": "text", "text": vehicle_text}))

    # Block 2: recent DTCs — dynamic, placed after the cache breakpoint so
    # different DTC sets don't invalidate the stable prefix.
    if recent_dtcs:
        dtc_lines = ["Recent Diagnostic Trouble Codes stored in the vehicle ECU:"]
        for code in recent_dtcs:
            dtc_lines.append(f"  • {code}")
        blocks.append({"type": "text", "text": "\n".join(dtc_lines)})

    return blocks
