"""The catalogue exists to stop one specific wrong answer.

Asked what a manufacturer-specific code means, a model will name a definition
for whichever brand it associates with the number. P1133 is four different
faults across Ford, GM, Toyota and BMW, so the wrong one is not an
approximation — it points at the wrong repair.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.claude.dtc_catalog import (
    describe_codes,
    is_sae_generic,
    known_makes,
    lookup,
    normalize_make,
)
from app.claude.prompt import build_system_prompt


class TestIsSaeGeneric:
    def test_decided_by_the_number_not_by_what_we_stored(self) -> None:
        # A standardised code we hold no description for is still generic.
        assert is_sae_generic("P2999") is True
        assert lookup("P2999")["description"] is None

    @pytest.mark.parametrize("code", ["P0420", "P2195", "U0100", "B0001", "C0035", "P3400"])
    def test_generic_ranges(self, code: str) -> None:
        assert is_sae_generic(code) is True

    @pytest.mark.parametrize("code", ["P1133", "P3000", "P3399", "U1000", "B1200", "C1201"])
    def test_manufacturer_ranges(self, code: str) -> None:
        assert is_sae_generic(code) is False

    @pytest.mark.parametrize("code", ["", "P042", "X0420", "nonsense"])
    def test_malformed(self, code: str) -> None:
        assert is_sae_generic(code) is False


class TestLookup:
    def test_generic_code_answers_without_a_make(self) -> None:
        info = lookup("P0420")
        assert info["source"] == "generic"
        assert info["description"] == "Catalyst System Efficiency Below Threshold Bank 1"
        assert info["needs_make"] is False

    def test_same_code_means_different_faults_per_make(self) -> None:
        ford = lookup("P1133", make="Ford")["description"]
        bmw = lookup("P1133", make="BMW")["description"]
        toyota = lookup("P1133", make="Toyota")["description"]

        assert ford == "Bank 1 Fuel Control Shifted Lean"
        assert bmw == "O2 Sensor Heater Control Circuit Bank 2 Sensor 1"
        assert toyota == "Air/Fuel Sensor Circuit Response Bank 1 Sensor 1"
        assert len({ford, bmw, toyota}) == 3

    def test_manufacturer_code_without_a_make_is_unanswered(self) -> None:
        info = lookup("P1133")
        assert info["description"] is None
        assert info["needs_make"] is True

    def test_never_borrows_a_neighbouring_make(self) -> None:
        # Honda has a table and no P1133 in it. Serving GM's text here would be
        # the original bug wearing a lookup table.
        info = lookup("P1133", make="Honda")
        assert info["description"] is None
        assert info["needs_make"] is False

    def test_unknown_make_is_reported_as_unknown_make(self) -> None:
        # Hyundai has no table upstream; that is not the same as "no such code".
        assert lookup("P1133", make="Hyundai")["needs_make"] is True

    def test_make_is_ignored_for_generic_codes(self) -> None:
        assert lookup("P0420", make="Ford")["description"] == lookup("P0420")["description"]

    def test_the_tables_are_broad_enough_to_be_worth_consulting(self) -> None:
        makes = known_makes()
        assert len(makes) > 25
        # Gaps the assistant has to cover with search rather than pretend away.
        assert "HYUNDAI" not in makes


class TestNormalizeMake:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Chevrolet", "CHEVY"),
            ("MERCEDES-BENZ", "MERCEDES"),
            ("vw", "VOLKSWAGEN"),
            ("Scion", "TOYOTA"),
            (" toyota ", "TOYOTA"),
        ],
    )
    def test_spellings_a_vin_decoder_produces(self, raw: str, expected: str) -> None:
        assert normalize_make(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "Tesla"])
    def test_no_near_misses(self, raw: str | None) -> None:
        assert normalize_make(raw) is None


class TestDescribeCodes:
    def test_labels_where_each_definition_came_from(self) -> None:
        block = describe_codes(["P0420", "P1133"], make="Ford")
        assert block is not None
        assert "SAE generic" in block
        assert "definition for FORD" in block

    def test_tells_the_model_to_establish_the_make(self) -> None:
        block = describe_codes(["P1133"])
        assert block is not None
        assert "establish the make first" in block
        # The failure mode this replaces: enumerating brands and picking one.
        assert "do not pick" in block.lower()

    def test_points_at_search_when_the_database_has_nothing(self) -> None:
        block = describe_codes(["P2999"])
        assert block is not None
        assert "web_search" in block

    def test_deduplicates_and_ignores_empties(self) -> None:
        block = describe_codes(["P0420", "p0420", "  "])
        assert block is not None
        assert block.count("P0420") == 1

    def test_nothing_to_say_returns_none(self) -> None:
        assert describe_codes([]) is None


class TestPromptIntegration:
    def _dynamic_block(self, **kwargs: object) -> str:
        blocks = build_system_prompt(**kwargs)  # type: ignore[arg-type]
        return blocks[-1]["text"]

    def test_definitions_reach_the_prompt(self) -> None:
        text = self._dynamic_block(
            locale="en", make="Ford", adapter_connected=True, recent_dtcs=["P0420", "P1133"]
        )
        assert "Bank 1 Fuel Control Shifted Lean" in text
        assert "Catalyst System Efficiency Below Threshold Bank 1" in text

    def test_unknown_make_yields_an_instruction_not_a_guess(self) -> None:
        text = self._dynamic_block(
            locale="en", adapter_connected=True, recent_dtcs=["P1133"]
        )
        assert "Bank 1 Fuel Control Shifted Lean" not in text
        assert "establish the make first" in text

    def test_definitions_stay_out_of_the_cached_prefix(self) -> None:
        # A per-vehicle DTC set in the cached block would invalidate the prompt
        # cache on every new code — the blocks are split precisely to avoid it.
        blocks = build_system_prompt(
            locale="en", make="Ford", adapter_connected=True, recent_dtcs=["P1133"]
        )
        cached = [b for b in blocks if b.get("cache_control")]
        assert cached, "expected a cached block"
        for block in cached:
            assert "Bank 1 Fuel Control Shifted Lean" not in block["text"]


def test_backend_tables_match_the_shared_package() -> None:
    """The backend's copy is generated from packages/obd-protocol.

    Docker copies only `services/backend/src`, so the tables are duplicated
    there. A stale copy would silently answer from older data — regenerate with
    `pnpm --filter @obd-car/obd-protocol generate:dtcs`.
    """
    backend_dir = Path(__file__).resolve().parents[1] / "src" / "app" / "claude" / "data"
    shared_dir = (
        Path(__file__).resolve().parents[3] / "packages" / "obd-protocol" / "data"
    )
    if not shared_dir.exists():  # pragma: no cover - shared package not checked out
        pytest.skip("shared package not present")

    for name in ("dtc-generic.json", "dtc-by-make.json"):
        assert json.loads((backend_dir / name).read_text(encoding="utf-8")) == json.loads(
            (shared_dir / name).read_text(encoding="utf-8")
        ), f"{name} is out of date — regenerate it"
