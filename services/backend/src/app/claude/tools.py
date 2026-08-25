"""OBD-II tool catalogue handed to Claude.

Every vehicle number the assistant is allowed to state comes from one of these
tools. The phone implements them in `apps/mobile/src/hooks/useToolExecutor.ts`
and answers over the WebSocket bridge (`transport.WebSocketToolTransport`), so
**the names and input shapes here must match that switch statement exactly** —
a mismatch surfaces to the user as "Unknown tool" rather than a failed read.

Why this file exists at all: without a tool catalogue the model has no way to
ask for data, and a model asked for a reading it cannot take will happily
narrate a plausible one instead. The grounding rules in `prompt.py` tell it not
to invent; this list is what makes obeying them possible.
"""

from __future__ import annotations

from typing import Any

# PIDs the phone can actually decode. Mirrors `PIDS` in
# `packages/obd-protocol/src/pids.ts` — `PidReader.readPid` rejects anything
# outside this set, so offering the model a wider choice would only produce
# failed reads.
READABLE_PIDS: dict[str, str] = {
    "010C": "Engine RPM (rpm)",
    "010D": "Vehicle speed (km/h)",
    "0105": "Engine coolant temperature (°C)",
    "012F": "Fuel tank level (%)",
    "0142": "Control module / battery voltage (V)",
}

_PID_ENUM = list(READABLE_PIDS)
_PID_DESCRIPTION = "Mode-01 PID to read. " + "; ".join(
    f"{pid} = {label}" for pid, label in READABLE_PIDS.items()
)


def _tool(
    name: str,
    description: str,
    properties: dict[str, Any] | None = None,
    required: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties or {},
            "required": required or [],
        },
    }


OBD_TOOLS: list[dict[str, Any]] = [
    _tool(
        "read_pid",
        "Read one live sensor value from the vehicle's ECU over OBD-II. "
        "Returns the decoded value with its unit. Use this whenever the user "
        "asks what something currently is — never answer from memory or from a "
        "typical value for the model.",
        {
            "pid": {
                "type": "string",
                "enum": _PID_ENUM,
                "description": _PID_DESCRIPTION,
            }
        },
        ["pid"],
    ),
    _tool(
        "read_battery_voltage",
        "Read the control module (battery) voltage in volts. Convenience wrapper around PID 0142.",
    ),
    _tool(
        "read_dtcs",
        "Read stored Diagnostic Trouble Codes from the ECU. Returns each code "
        "with a description when one is known. An empty list means the ECU "
        "reported no codes — report that as 'no codes stored', not as a "
        "failure to read.",
        {
            "include_pending": {
                "type": "boolean",
                "description": "Also return pending (mode 07) codes — faults "
                "seen once but not yet confirmed over enough drive cycles.",
            }
        },
    ),
    _tool(
        "read_permanent_dtcs",
        "Read permanent DTCs (mode 0A). These cannot be cleared with a scan "
        "tool and only clear once the ECU's own monitors pass, so they are the "
        "honest answer to 'did the fault really go away?'.",
    ),
    _tool(
        "read_freeze_frame",
        "Read one freeze-frame value — the sensor snapshot the ECU stored at "
        "the moment a DTC was set. Requires the DTC the frame belongs to.",
        {
            "pid": {
                "type": "string",
                "enum": _PID_ENUM,
                "description": _PID_DESCRIPTION,
            },
            "dtc_code": {
                "type": "string",
                "description": "DTC the freeze frame belongs to, e.g. 'P0301'.",
            },
        },
        ["pid", "dtc_code"],
    ),
    _tool(
        "read_vin",
        "Read the vehicle identification number from the ECU (mode 09, PID 02).",
    ),
    _tool(
        "clear_dtcs",
        "Clear stored Diagnostic Trouble Codes and turn off the check-engine "
        "light. This ERASES the ECU's fault memory and freeze-frame data, and "
        "resets readiness monitors — it does not repair anything. Requires "
        "explicit user confirmation before it will run; the backend refuses it "
        "otherwise. Never call it as a side effect of a diagnostic question.",
    ),
]

OBD_TOOL_NAMES: frozenset[str] = frozenset(tool["name"] for tool in OBD_TOOLS)


# ── Web research ──────────────────────────────────────────────────────────────
#
# Manufacturer-specific DTCs (P1xxx, P30xx–P33xx, B1/B2, C1/C2, U1/U2) mean
# different things on different makes: the same P1133 is one fault on a Honda
# and another on a GM. The model has no reliable memory for those tables, and
# when asked it will produce a confident answer for the wrong brand — the exact
# failure the grounding rules exist to prevent. Search closes that gap with a
# citeable source instead of recall.
#
# The allowlist is the topic restriction. `allowed_domains` is a hard filter
# applied by the API, so a request about anything other than vehicles finds
# nothing to cite — the list deliberately contains no general-purpose site
# (no Wikipedia, no Reddit, no search portals) that could serve an off-topic
# query. Every entry was checked to resolve; a dead domain silently narrows
# coverage. Bare domains cover their subdomains.
AUTOMOTIVE_SEARCH_DOMAINS: list[str] = [
    # DTC databases and OBD-II reference
    "obd-codes.com",
    "autocodes.com",
    "troublecodes.net",
    "engine-codes.com",
    "dtcsearch.com",
    "obdautodoctor.com",
    # Professional repair information
    "alldata.com",
    "prodemand.com",
    "mitchell1.com",
    "identifix.com",
    "repairpal.com",
    "haynes.com",
    "scannerdanner.com",
    "ricksfreeautorepairadvice.com",
    "yourmechanic.com",
    "samarins.com",
    "carcarekiosk.com",
    # Parts manufacturers' technical bulletins
    "boschautoparts.com",
    "ngksparkplugs.com",
    "standardbrand.com",
    # Retailer repair guides
    "autozone.com",
    "oreillyauto.com",
    "advanceautoparts.com",
    # Regulators and standards bodies — recalls, TSBs, OBD-II regulation
    "nhtsa.gov",
    "epa.gov",
    "arb.ca.gov",
    "sae.org",
    # Marque communities: where manufacturer-specific codes are actually
    # documented, often the only public source for a P1xxx on a given make.
    "bimmerforums.com",
    "mbworld.org",
    "toyotanation.com",
    "clublexus.com",
    "honda-tech.com",
    "driveaccord.net",
    "fordforums.com",
    "f150forum.com",
    "vwvortex.com",
    "audizine.com",
    "nasioc.com",
    "subaruoutback.org",
    "tdiclub.com",
    "hyundai-forums.com",
    "kia-forums.com",
    "nissanclub.com",
]

# Searches allowed per assistant turn. A code lookup takes 1–3; the cap stops a
# stuck turn from billing indefinitely (searches are charged per request) and
# from burning the dispatcher's iteration budget. Exceeding it is not an
# exception — the API returns a `max_uses_exceeded` result block and the model
# answers from what it already has.
WEB_SEARCH_MAX_USES: int = 5

# `web_search_20260209` filters results through code execution before they
# reach the context window (dynamic filtering, Claude 4.6+). Forum threads are
# long and mostly irrelevant, so this matters here: it is the difference
# between one useful paragraph and a whole page of signatures in context.
# Do not also declare `code_execution` — the API provisions it for this tool.
WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20260209",
    "name": "web_search",
    "max_uses": WEB_SEARCH_MAX_USES,
    "allowed_domains": AUTOMOTIVE_SEARCH_DOMAINS,
}


# The catalogue actually handed to the model: phone-executed OBD tools plus
# server-side search. Kept separate from OBD_TOOLS so the drift test that
# compares this list against `useToolExecutor.ts` keeps comparing only the
# tools the phone is expected to implement.
DEFAULT_TOOLS: list[dict[str, Any]] = [*OBD_TOOLS, WEB_SEARCH_TOOL]
