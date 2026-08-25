"""The tool catalogue is what makes grounded answers possible.

If it is empty or drifts out of sync with the phone, the model cannot fetch a
reading — and a model that cannot fetch a reading tends to narrate a plausible
one instead. These tests guard both failure modes.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.claude import OBD_TOOL_NAMES, OBD_TOOLS, READABLE_PIDS, WRITE_TOOLS

# services/backend/tests → repo root → the phone's executor.
_EXECUTOR = (
    Path(__file__).resolve().parents[3] / "apps" / "mobile" / "src" / "hooks" / "useToolExecutor.ts"
)


def test_catalogue_is_not_empty():
    assert OBD_TOOLS, "an empty tool list silently disables every vehicle read"


def test_every_tool_has_a_name_description_and_object_schema():
    for tool in OBD_TOOLS:
        assert tool["name"], tool
        # The description is the model's only guidance on when a real read is
        # required, so a blank one is a correctness problem, not a style one.
        assert len(tool["description"]) > 40, tool["name"]
        schema = tool["input_schema"]
        assert schema["type"] == "object"
        for required in schema["required"]:
            assert required in schema["properties"], tool["name"]


def test_read_pid_offers_only_pids_the_phone_can_decode():
    read_pid = next(t for t in OBD_TOOLS if t["name"] == "read_pid")
    assert read_pid["input_schema"]["properties"]["pid"]["enum"] == list(READABLE_PIDS)


def test_write_tools_are_present_and_flagged_for_confirmation():
    # `clear_dtcs` erases the ECU's fault memory; the dispatcher refuses it
    # without an explicit confirm_write, so it must exist in both places.
    assert WRITE_TOOLS <= OBD_TOOL_NAMES


@pytest.mark.skipif(not _EXECUTOR.exists(), reason="mobile app not checked out")
def test_catalogue_matches_the_phone_side_executor():
    """Name drift shows up to the user as 'Unknown tool', never as a clear error."""
    source = _EXECUTOR.read_text()
    phone_tools = set(re.findall(r"case '([a-z_]+)':", source))
    assert phone_tools == set(OBD_TOOL_NAMES), {
        "only_on_phone": sorted(phone_tools - OBD_TOOL_NAMES),
        "only_on_backend": sorted(OBD_TOOL_NAMES - phone_tools),
    }
