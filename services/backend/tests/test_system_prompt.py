from __future__ import annotations

import pytest

from app.claude import build_system_prompt
from app.claude.prompt import _LOCALE_LABELS, _ROLE_TEXT


# ── structure ─────────────────────────────────────────────────────────────────


def test_returns_list_of_dicts():
    result = build_system_prompt()
    assert isinstance(result, list)
    assert all(isinstance(b, dict) for b in result)


def test_one_block_when_no_dtcs():
    result = build_system_prompt(make="Toyota", model="Corolla", year=2019, vin="1HGBH41JXMN109186")
    assert len(result) == 1


def test_two_blocks_when_dtcs_present():
    result = build_system_prompt(recent_dtcs=["P0300", "P0420"])
    assert len(result) == 2


def test_empty_dtcs_list_yields_one_block():
    result = build_system_prompt(recent_dtcs=[])
    assert len(result) == 1


# ── cache breakpoint ──────────────────────────────────────────────────────────


def test_first_block_has_cache_breakpoint():
    result = build_system_prompt(make="BMW", model="320i", year=2021)
    assert result[0].get("cache_control") == {"type": "ephemeral"}


def test_dtc_block_has_no_cache_breakpoint():
    result = build_system_prompt(make="Ford", recent_dtcs=["P0171"])
    assert "cache_control" not in result[1]


# ── vehicle context ───────────────────────────────────────────────────────────


def test_vehicle_text_includes_make_model_year():
    result = build_system_prompt(make="Honda", model="Civic", year=2020)
    text = result[0]["text"]
    assert "2020" in text
    assert "Honda" in text
    assert "Civic" in text


def test_vehicle_text_includes_vin():
    result = build_system_prompt(vin="1HGBH41JXMN109186")
    assert "1HGBH41JXMN109186" in result[0]["text"]


def test_vehicle_unknown_when_no_fields():
    result = build_system_prompt()
    assert "unknown" in result[0]["text"]


def test_partial_vehicle_fields_no_error():
    result = build_system_prompt(make="Subaru")
    assert "Subaru" in result[0]["text"]


def test_year_only():
    result = build_system_prompt(year=2018)
    assert "2018" in result[0]["text"]


# ── locale / language ─────────────────────────────────────────────────────────


def test_default_locale_is_english():
    result = build_system_prompt()
    assert "English" in result[0]["text"]


def test_georgian_locale_label():
    result = build_system_prompt(locale="ka")
    assert _LOCALE_LABELS["ka"] in result[0]["text"]


def test_unknown_locale_falls_back_to_raw_tag():
    result = build_system_prompt(locale="fr")
    assert "fr" in result[0]["text"]


# ── DTCs block ────────────────────────────────────────────────────────────────


def test_dtc_codes_appear_in_second_block():
    result = build_system_prompt(recent_dtcs=["P0300", "P0420", "B0001"])
    dtc_text = result[1]["text"]
    assert "P0300" in dtc_text
    assert "P0420" in dtc_text
    assert "B0001" in dtc_text


def test_dtc_block_type_is_text():
    result = build_system_prompt(recent_dtcs=["P0300"])
    assert result[1]["type"] == "text"


# ── role text ─────────────────────────────────────────────────────────────────


def test_role_text_present_in_first_block():
    result = build_system_prompt()
    assert "OBD-II" in result[0]["text"]
    assert "clear_dtcs" in result[0]["text"]


# ── immutability ──────────────────────────────────────────────────────────────


def test_successive_calls_are_independent():
    r1 = build_system_prompt(make="Audi", recent_dtcs=["P0100"])
    r2 = build_system_prompt(make="Volvo", recent_dtcs=["P0200"])
    assert "Audi" in r1[0]["text"]
    assert "Volvo" in r2[0]["text"]
    assert "P0100" in r1[1]["text"]
    assert "P0200" in r2[1]["text"]
