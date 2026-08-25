"""VIN decoding, and the session plumbing that turns a VIN into a make.

Why decode at all: the make selects which manufacturer's DTC table applies, and
the model cannot be the one to supply it — asked to read a VIN it will name a
make for any string, including one it has never seen.
"""

from __future__ import annotations

import httpx
import pytest

from app.claude.vin_decoder import (
    _reset_cache_for_tests,
    decode_vin,
    resolve_make,
)

_VIN = "1HGCM82633A123456"


@pytest.fixture(autouse=True)
def _clean_cache() -> None:
    _reset_cache_for_tests()


def _client(handler: object) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))  # type: ignore[arg-type]


def _ok(payload: dict) -> object:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    return handler


@pytest.mark.asyncio
async def test_decodes_make_model_year() -> None:
    async with _client(
        _ok({"Results": [{"Make": "HONDA", "Model": "Accord", "ModelYear": "2003"}]})
    ) as client:
        decoded = await decode_vin(_VIN, client=client)

    assert decoded is not None
    assert (decoded.make, decoded.model, decoded.year) == ("HONDA", "Accord", 2003)


@pytest.mark.asyncio
async def test_caches_so_a_vehicle_is_decoded_once() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"Results": [{"Make": "HONDA"}]})

    async with _client(handler) as client:
        await decode_vin(_VIN, client=client)
        await decode_vin(_VIN, client=client)
        await decode_vin(_VIN.lower(), client=client)

    assert calls == 1


@pytest.mark.asyncio
async def test_a_failed_decode_is_unknown_not_a_default() -> None:
    # Substituting a plausible make here would put the wrong manufacturer's
    # definition behind every P1xxx for this car.
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("vpic unreachable")

    async with _client(handler) as client:
        assert await decode_vin(_VIN, client=client) is None


@pytest.mark.asyncio
async def test_empty_vpic_answer_is_unknown() -> None:
    # vPIC answers 200 with blank fields for a VIN it cannot place.
    async with _client(_ok({"Results": [{"Make": "", "Model": ""}]})) as client:
        assert await decode_vin(_VIN, client=client) is None


@pytest.mark.asyncio
async def test_a_failure_is_not_cached_as_unknown() -> None:
    """A timeout must not poison the VIN for the rest of the process."""
    state = {"fail": True}

    def handler(_request: httpx.Request) -> httpx.Response:
        if state["fail"]:
            state["fail"] = False
            raise httpx.ConnectTimeout("first attempt")
        return httpx.Response(200, json={"Results": [{"Make": "HONDA"}]})

    async with _client(handler) as client:
        assert await decode_vin(_VIN, client=client) is None
        decoded = await decode_vin(_VIN, client=client)

    assert decoded is not None and decoded.make == "HONDA"


@pytest.mark.asyncio
@pytest.mark.parametrize("vin", [None, "", "1HGCM8", "1HGCM82633A1234567890"])
async def test_only_a_full_vin_is_decoded(vin: str | None) -> None:
    # vPIC will answer for a fragment, vaguely but confidently. Not worth
    # trusting when the answer picks a DTC table.
    assert await resolve_make(vin) is None
