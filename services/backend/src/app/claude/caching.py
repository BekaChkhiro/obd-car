"""Prompt-caching helpers.

Anthropic's prompt caching is opt-in per content block via the
`cache_control: {"type": "ephemeral"}` marker. Marking the last stable
block in a sequence creates a cache breakpoint: everything from the
start of the request up to and including that block is reused on
subsequent requests with an identical prefix (5-minute TTL).

The system prompt builder (T3.5) uses these helpers to mark the
vehicle-context section and tool definitions for caching.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

_EPHEMERAL: dict[str, str] = {"type": "ephemeral"}


def cache_breakpoint_text(text: str) -> dict[str, Any]:
    """Build a text content block marked as a cache breakpoint."""
    return {"type": "text", "text": text, "cache_control": dict(_EPHEMERAL)}


def apply_cache_breakpoint(block: dict[str, Any]) -> dict[str, Any]:
    """Return a shallow copy of `block` with `cache_control: ephemeral` set."""
    return {**block, "cache_control": dict(_EPHEMERAL)}


def mark_last_block_cached(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a copy of `blocks` where the last block is marked as a cache breakpoint.

    Empty input is returned unchanged. The caller's list is not mutated.
    """
    if not blocks:
        return list(blocks)
    out = [deepcopy(b) for b in blocks]
    out[-1] = apply_cache_breakpoint(out[-1])
    return out
