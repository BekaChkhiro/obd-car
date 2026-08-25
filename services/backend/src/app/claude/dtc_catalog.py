"""Authoritative DTC definitions, injected into the prompt rather than recalled.

The model's memory for trouble codes is unreliable in a specific, dangerous
way: asked what a manufacturer-specific code means it produces a confident
definition for whichever brand it associates with the number. P1133 is "Bank 1
Fuel Control Shifted Lean" on a Ford, "HO2S Insufficient Switching" across GM,
"Air/Fuel Sensor Circuit Response Bank 1 Sensor 1" on a Toyota and "O2 Sensor
Heater Control Circuit Bank 2 Sensor 1" on a BMW. Those are four different
repairs, so the wrong one is not a rough answer — it sends someone to replace
the wrong part.

The tables come from `packages/obd-protocol`; regenerate both copies with
`pnpm --filter @obd-car/obd-protocol generate:dtcs`. Data is MIT-licensed,
Copyright (c) 2024 Wal33D (Waleed Judah) — see vendor/dtc-database/LICENSE.

Two rules hold everywhere in this module:

  • Whether a code is generic is decided by its number, never by whether we
    hold a description for it.
  • A manufacturer-specific code is answered only from that make's table.
    No neighbouring make, no "typical" meaning, no fallback.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).parent / "data"

_CODE_RE = re.compile(r"^[PBCU][0-9A-F]{4}$")

# Spellings NHTSA's VIN decoder and users actually produce, mapped onto the
# table keys. Anything absent falls through to an exact match.
_MAKE_ALIASES: dict[str, str] = {
    "CHEVROLET": "CHEVY",
    "MERCEDESBENZ": "MERCEDES",
    "MERCEDESBENZAG": "MERCEDES",
    "VW": "VOLKSWAGEN",
    "GENERALMOTORS": "GM",
    "GMCTRUCK": "GMC",
    "SCION": "TOYOTA",
    "VAUXHALL": "GM",
}


@lru_cache(maxsize=1)
def _generic() -> dict[str, str]:
    return json.loads((_DATA_DIR / "dtc-generic.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _by_make() -> dict[str, dict[str, str]]:
    return json.loads((_DATA_DIR / "dtc-by-make.json").read_text(encoding="utf-8"))


def known_makes() -> list[str]:
    """Makes with a manufacturer-specific table."""
    return sorted(_by_make())


def is_sae_generic(code: str) -> bool:
    """True when the number is in an SAE J2012 standardised range.

    P0xxx and P2xxx are generic; P1xxx and P3000-P33xx are manufacturer-
    defined, with P3400-P39xx handed back to SAE. For Body, Chassis and
    Network codes only the x0xxx block is standardised.
    """
    upper = code.strip().upper()
    if not _CODE_RE.match(upper):
        return False

    category, subcategory = upper[0], upper[1]
    if category == "P":
        if subcategory in ("0", "2"):
            return True
        if subcategory == "3":
            return "4" <= upper[2] <= "9"
        return False
    return subcategory == "0"


def normalize_make(raw: str | None) -> str | None:
    """Map a free-form make onto a table key, or None when we hold no table.

    None means "make unknown to us", never "no such code" — the caller must
    keep those apart or it will report a missing table as a missing fault.
    """
    if not raw:
        return None
    squashed = re.sub(r"[^A-Z]", "", raw.upper())
    if not squashed:
        return None
    key = _MAKE_ALIASES.get(squashed, squashed)
    return key if key in _by_make() else None


def lookup(code: str, *, make: str | None = None) -> dict[str, Any]:
    """Resolve one code.

    Returns `description=None` with `needs_make=True` when the code is
    manufacturer-specific and the make is unknown. That is the honest result:
    there is no single meaning to report.
    """
    upper = code.strip().upper()
    resolved_make = normalize_make(make)

    if is_sae_generic(upper):
        description = _generic().get(upper)
        return {
            "code": upper,
            "description": description,
            "source": "generic" if description else "none",
            "make": None,
            "is_generic": True,
            "needs_make": False,
        }

    if resolved_make is None:
        return {
            "code": upper,
            "description": None,
            "source": "none",
            "make": None,
            "is_generic": False,
            "needs_make": True,
        }

    description = _by_make()[resolved_make].get(upper)
    return {
        "code": upper,
        "description": description,
        "source": "make" if description else "none",
        "make": resolved_make if description else None,
        "is_generic": False,
        # We hold this make's table and it has no such code; asking the user
        # which car it is again would not produce one.
        "needs_make": False,
    }


def describe_codes(codes: list[str], *, make: str | None = None) -> str | None:
    """Render definitions for `codes` as a prompt block, or None if there is nothing to say.

    Each line states where the definition came from, because "this is what
    Ford means by it" and "no source has this code" have to reach the user as
    different answers.
    """
    if not codes:
        return None

    seen: set[str] = set()
    lines: list[str] = []
    unknown_make_codes: list[str] = []

    for code in codes:
        upper = code.strip().upper()
        if not upper or upper in seen:
            continue
        seen.add(upper)

        info = lookup(upper, make=make)
        if info["source"] == "generic":
            lines.append(f"- {upper}: {info['description']} (SAE generic — same on every make)")
        elif info["source"] == "make":
            lines.append(f"- {upper}: {info['description']} (definition for {info['make']})")
        elif info["needs_make"]:
            unknown_make_codes.append(upper)
            lines.append(
                f"- {upper}: manufacturer-specific — no definition available "
                "because the vehicle's make is not known"
            )
        else:
            lines.append(f"- {upper}: no definition in the bundled database")

    if not lines:
        return None

    block = ["## Trouble code definitions (authoritative — use these verbatim)"]
    block.append(
        "These come from the bundled SAE and manufacturer tables. Prefer them "
        "over your own recollection, and do not restate a code's meaning "
        "differently from what is listed here."
    )
    block.append("")
    block.extend(lines)

    if unknown_make_codes:
        block.append("")
        block.append(
            "For "
            + ", ".join(unknown_make_codes)
            + ": establish the make first (call read_vin, or ask the user). Do "
            "not list what the code means on several brands and do not pick "
            "one — on a different make it is a different fault, and the wrong "
            "definition sends the user to replace the wrong part. Once you "
            "know the make, search for that make and code."
        )
    elif any("no definition in the bundled database" in line for line in lines):
        block.append("")
        block.append(
            "Where no definition is listed, say so and use web_search rather "
            "than filling the gap from memory."
        )

    return "\n".join(block)
