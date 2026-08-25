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
Block 2 — live-data availability + recent DTCs:
    Dynamic. No cache breakpoint. Placed after Block 1 so a changing
    adapter state or DTC set doesn't invalidate the stable vehicle-context
    cache. This block is what keeps the model honest about whether it can
    actually read the car right now — see `_GROUNDING_RULES`.

Pass the returned list directly as the ``system=`` argument to
``ClaudeClient.stream(...)``.
"""

from __future__ import annotations

from typing import Any

from .caching import apply_cache_breakpoint

# Display labels for supported locales. Unknown locales fall back to the raw tag.
from .dtc_catalog import describe_codes

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
    "You can also search a curated set of automotive sources on the web "
    "(DTC databases, factory and aftermarket repair information, NHTSA "
    "recalls and technical service bulletins, and marque communities) for "
    "code definitions and repair procedures you do not reliably know. "
    "Diagnose issues, explain fault codes in plain language, and guide the "
    "user through next steps. Never dispatch write operations (such as "
    "clear_dtcs) without first receiving an explicit confirmation from the user."
)

# Anti-fabrication contract. The single most important part of this prompt:
# the assistant is talking about a physical car the user is standing next to,
# so a plausible-sounding invented reading is worse than no answer at all.
# Kept in the cached block — it is static for every session.
_GROUNDING_RULES = (
    "## Data grounding rules (strict)\n"
    "1. Every vehicle-specific fact you state — sensor readings, DTCs, VIN, "
    "freeze-frame values, monitor status — MUST come from a tool result you "
    "received in THIS conversation. Never invent, estimate, simulate, "
    "extrapolate, or fill in a plausible-looking value.\n"
    "2. If you have not yet run the tool that would answer the question, run "
    "it. If you cannot run it, say what is missing — do not guess.\n"
    "3. If a tool returns an error, times out, or reports that no adapter is "
    "connected, tell the user plainly that the reading could NOT be taken and "
    "why. Never substitute a typical or example value for a failed read.\n"
    "4. Report values exactly as the tool returned them, with the tool's unit. "
    "Do not silently round, convert, or 'clean up' a reading.\n"
    "5. You may use general automotive knowledge to explain and interpret, but "
    "label it as such. Never phrase general knowledge so that it could be "
    "mistaken for a measurement from this vehicle.\n"
    "6. Never claim an action was performed — codes cleared, monitors reset — "
    "unless a tool result confirms it.\n"
    "7. If live data is unavailable, lead with that fact, then offer what you "
    "can answer without it. Do not answer as if the car were connected."
)


# The model's recall of manufacturer-specific DTC tables is unreliable: asked
# what a P1xxx means it will answer confidently for whichever make it happens to
# associate with the number, which is a coin flip. Search replaces that guess
# with a citeable source — but only if the model knows the make first, and only
# if it never reaches for search when the honest answer is a tool reading.

_RESEARCH_RULES = (
    "## Web research rules\n"
    "You have a `web_search` tool restricted to automotive diagnostic sources. "
    "It cannot reach the wider web, so do not offer to look up anything "
    "unrelated to vehicles.\n"
    "1. DTC numbering tells you whether a code is standardised or not. "
    "Generic (identical on every make): P0xxx, P2xxx, P34xx-P39xx, B0xxx, "
    "C0xxx, U0xxx. Manufacturer-specific (meaning differs per make): P1xxx, "
    "P30xx-P33xx, B1xxx-B3xxx, C1xxx-C3xxx, U1xxx-U3xxx.\n"
    "2. For a manufacturer-specific code you MUST know the make before you "
    "state what it means. If the make is not established, do not list "
    "candidate meanings for several brands and do not pick one — call "
    "`read_vin` if an adapter is connected, otherwise ask the user for the "
    "make, model and year. A definition for the wrong make is a wrong answer, "
    "not a partial one.\n"
    "3. Once you know the make, search for that exact code together with the "
    "make (and model/year where it narrows things) rather than answering from "
    "memory. Search too when a generic code's specifics matter for this "
    "vehicle, when the user asks about a repair procedure, torque figure or "
    "part number, or when a recall or technical service bulletin might apply.\n"
    "4. Cite what you used. Name the source for any definition, procedure or "
    "specification that came from a search result, and say plainly when "
    "sources disagree rather than merging them into one confident answer.\n"
    "5. Search results describe what is typical for a make or model. They are "
    "NEVER a measurement from this car. Never present a searched value as a "
    "reading, and never use search in place of a tool call — if the user asks "
    "what something currently is, read it.\n"
    "6. If a search returns nothing useful, say so and describe how the fault "
    "would normally be diagnosed. Do not fabricate a definition to fill the "
    "gap, and do not present an unsourced guess as if it were researched."
)


# Rendered into the dynamic block so the model always knows whether the phone
# currently holds an OBD-II link. Without this the model only discovers the
# adapter is missing after a tool call fails — and may guess instead.
_LIVE_DATA_CONNECTED = (
    "## Live vehicle data: AVAILABLE\n"
    "An OBD-II adapter is connected to the vehicle and your tools will reach "
    "the ECU. Read what you need rather than asking the user to read it for you."
)

_LIVE_DATA_DISCONNECTED = (
    "## Live vehicle data: UNAVAILABLE\n"
    "No OBD-II adapter is currently connected, so every read tool will fail. "
    "Do not call read tools expecting data, and do not state any current "
    "reading, DTC, or VIN for this vehicle. Tell the user the scanner is not "
    "connected and that they need to plug in and pair the adapter. You may "
    "still answer general questions, clearly labelled as general knowledge."
)

# Demo mode ships: someone with no dongle (an App Store reviewer, a user
# browsing before buying one) gets a mock ELM327 so the app is usable. That
# link is real enough for the tools, which makes it the one state where the
# model can be handed numbers that are not measurements — so this block has to
# do the work the tool results cannot: say out loud where they came from.
_LIVE_DATA_SIMULATED = (
    "## Live vehicle data: SIMULATED (demo adapter)\n"
    "The app is running in demo mode against a built-in simulator. There is no "
    "OBD-II adapter plugged into a car. Your read tools DO work and will return "
    "values — and every one of those values is generated by that simulator. "
    "Nothing you read was measured on the user's vehicle, which may not even be "
    "present.\n"
    "1. Say so whenever you report anything the tools returned — a sensor "
    "reading, a DTC, a VIN, a freeze frame. Name it as simulated demo data, "
    "not as something you read off their car. Once per answer, up front, is "
    "enough; do not bury it at the end.\n"
    "2. Never draw a conclusion about the user's actual vehicle from these "
    "numbers. Do not tell them they have a fault, do not tell them a component "
    "is healthy, and do not recommend a repair on this basis.\n"
    "3. Do use the demo data to show what this assistant does: read it, explain "
    "what such a value or code would mean in general, and walk through how you "
    "would diagnose it — keeping the framing hypothetical throughout.\n"
    "4. If the user asks about their own car, tell them plainly that you cannot "
    "answer that yet and that it needs a real OBD-II adapter paired to the "
    "vehicle."
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

    lines.append("")
    lines.append(_GROUNDING_RULES)
    lines.append("")
    lines.append(_RESEARCH_RULES)

    return "\n".join(lines)


def _live_data_block_text(
    *,
    adapter_connected: bool | None,
    adapter_simulated: bool = False,
    supported_pids: list[str] | None,
    recent_dtcs: list[str] | None,
    make: str | None = None,
) -> str | None:
    """Render the dynamic block: adapter reachability, PID support, recent DTCs.

    Returns ``None`` when there is nothing dynamic to say, so the caller can
    emit a single cached block and keep the prompt minimal.
    """
    sections: list[str] = []

    if adapter_connected is True and adapter_simulated:
        sections.append(_LIVE_DATA_SIMULATED)
    elif adapter_connected is True:
        sections.append(_LIVE_DATA_CONNECTED)
    elif adapter_connected is False:
        sections.append(_LIVE_DATA_DISCONNECTED)

    # Only meaningful while connected — a stale PID list from a previous
    # connection would imply live data that is not actually reachable.
    if adapter_connected is True and supported_pids:
        listed = ", ".join(sorted(supported_pids))
        # Sourcing matters here too: under simulation the bitmap is the
        # simulator's, and "the vehicle's own" would be the prompt itself
        # passing generated data off as the car's.
        origin = (
            "This list came from the simulator's mode-01 availability bitmap, not a vehicle. "
            if adapter_simulated
            else "This list came from the vehicle's own mode-01 availability bitmap. "
        )
        sections.append(
            "## PIDs this ECU reported as supported\n"
            f"{listed}\n"
            f"{origin}"
            "A PID not in this list is not supported by this ECU — if the user "
            "asks for it, say it is unavailable rather than reading something else."
        )
    elif adapter_connected is True:
        sections.append(
            "## PIDs this ECU reported as supported\n"
            "Not yet discovered. Do not assume any particular PID is available; "
            "attempt the read and report what actually comes back."
        )

    if recent_dtcs:
        dtc_lines = ["Recent Diagnostic Trouble Codes stored in the vehicle ECU:"]
        for code in recent_dtcs:
            dtc_lines.append(f"  • {code}")
        sections.append("\n".join(dtc_lines))

        # Hand the model the definitions instead of letting it recall them.
        # For a manufacturer-specific code its recall is effectively a guess at
        # which brand the number belongs to, and the block says so explicitly
        # rather than leaving a silence the model will fill.
        definitions = describe_codes(recent_dtcs, make=make)
        if definitions:
            sections.append(definitions)

    if not sections:
        return None
    return "\n\n".join(sections)


def build_system_prompt(
    *,
    make: str | None = None,
    model: str | None = None,
    year: int | None = None,
    vin: str | None = None,
    locale: str = "en",
    recent_dtcs: list[str] | None = None,
    adapter_connected: bool | None = None,
    adapter_simulated: bool = False,
    supported_pids: list[str] | None = None,
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
    adapter_connected:
        Whether the phone currently holds a live OBD-II link. ``True`` tells
        the model its read tools will reach the ECU; ``False`` tells it they
        will fail, so it must say so instead of guessing a value. ``None``
        (the default) omits the statement entirely — only appropriate when
        the caller genuinely does not know.
    adapter_simulated:
        Whether that link is the demo simulator rather than a dongle in a car.
        Only meaningful together with ``adapter_connected=True``: the tools
        work, but nothing they return is a measurement, so the model is told
        to report every value as generated and to draw no conclusion about the
        user's vehicle.
    supported_pids:
        PIDs the ECU reported via its mode-01 availability bitmap. Used only
        when ``adapter_connected`` is ``True``; a list carried over from a
        previous connection would imply live data that is not reachable.
    """
    blocks: list[dict[str, Any]] = []

    # Block 1: stable role + vehicle context — cache breakpoint here so every
    # turn in the same session reuses this prefix from the Anthropic cache.
    vehicle_text = _vehicle_block_text(
        make=make, model=model, year=year, vin=vin, locale=locale
    )
    blocks.append(apply_cache_breakpoint({"type": "text", "text": vehicle_text}))

    # Block 2: live-data availability, discovered PIDs, and recent DTCs —
    # dynamic, placed after the cache breakpoint so a changing adapter state
    # or DTC set doesn't invalidate the stable prefix.
    live_text = _live_data_block_text(
        adapter_connected=adapter_connected,
        adapter_simulated=adapter_simulated,
        supported_pids=supported_pids,
        recent_dtcs=recent_dtcs,
        make=make,
    )
    if live_text is not None:
        blocks.append({"type": "text", "text": live_text})

    return blocks
