"""VIN → make, via NHTSA's public vPIC decoder.

The make is not cosmetic here: it decides what a manufacturer-specific DTC
means. P1133 is "Bank 1 Fuel Control Shifted Lean" on a Ford and "O2 Sensor
Heater Control Circuit Bank 2 Sensor 1" on a BMW, so getting the make wrong is
getting the diagnosis wrong.

Which is why this decodes rather than guesses. Asking the model to read the VIN
puts the identification back inside the thing we are trying to ground — it will
produce a make for any VIN, including one it has never seen. vPIC is the
manufacturer registry itself: free, no API key, and authoritative about which
WMI belongs to whom.

Failure is always soft. A decode that times out or comes back empty leaves the
make unknown, and an unknown make makes the assistant ask which car this is —
slower, but never wrong.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx
import structlog

log = structlog.get_logger(__name__)

_VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json"

# vPIC sits between the phone and an answer, so it gets one short attempt. The
# assistant degrades to asking for the make, which beats stalling a turn.
_TIMEOUT_SECONDS = 4.0

# VINs repeat for every turn of every session on that car, so the cache does
# almost all the work. Bounded because it is process-lifetime state.
_MAX_CACHE_ENTRIES = 512


@dataclass(frozen=True)
class DecodedVin:
    vin: str
    make: str | None
    model: str | None
    year: int | None


_cache: dict[str, DecodedVin] = {}
# One decode per VIN even when several turns race on a fresh session.
_locks: dict[str, asyncio.Lock] = {}


def _parse(vin: str, payload: dict) -> DecodedVin:
    results = payload.get("Results") or []
    row = results[0] if results else {}

    def field(name: str) -> str | None:
        value = row.get(name)
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    year_raw = field("ModelYear")
    year: int | None = None
    if year_raw and year_raw.isdigit():
        year = int(year_raw)

    return DecodedVin(vin=vin, make=field("Make"), model=field("Model"), year=year)


async def decode_vin(vin: str | None, *, client: httpx.AsyncClient | None = None) -> DecodedVin | None:
    """Decode a VIN, or return None when it cannot be decoded.

    None means "we do not know this vehicle" — never "no such vehicle". The
    caller must not substitute a default make for it.
    """
    if not vin:
        return None
    key = vin.strip().upper()
    # vPIC accepts partial VINs, but a fragment decodes to a vaguer answer that
    # still looks confident. Only a full VIN is worth trusting here.
    if len(key) != 17:
        return None

    cached = _cache.get(key)
    if cached is not None:
        return cached

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = _cache.get(key)
        if cached is not None:
            return cached

        try:
            if client is not None:
                response = await client.get(_VPIC_URL.format(vin=key), timeout=_TIMEOUT_SECONDS)
            else:
                async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as owned:
                    response = await owned.get(_VPIC_URL.format(vin=key))
            response.raise_for_status()
            decoded = _parse(key, response.json())
        except Exception as exc:  # noqa: BLE001 - a decode failure must never break a turn
            log.warning("vin_decode_failed", vin=key, error=str(exc))
            _locks.pop(key, None)
            return None

        if decoded.make is None:
            # vPIC answers 200 with empty fields for a VIN it cannot place.
            log.info("vin_decode_empty", vin=key)
            _locks.pop(key, None)
            return None

        if len(_cache) >= _MAX_CACHE_ENTRIES:
            _cache.clear()
        _cache[key] = decoded
        _locks.pop(key, None)
        return decoded


async def resolve_make(vin: str | None) -> str | None:
    """The make for a VIN, or None when unknown. Never raises."""
    decoded = await decode_vin(vin)
    return decoded.make if decoded else None


def _reset_cache_for_tests() -> None:
    _cache.clear()
    _locks.clear()
