"""Model IDs and routing for the Claude wrapper."""

from __future__ import annotations

from enum import StrEnum


class ClaudeModel(StrEnum):
    SONNET_4_6 = "claude-sonnet-4-6"
    HAIKU_4_5 = "claude-haiku-4-5-20251001"


DEFAULT_MODEL: str = ClaudeModel.SONNET_4_6.value
SHORT_CLARIFICATION_MODEL: str = ClaudeModel.HAIKU_4_5.value


def route_model(*, short_clarification: bool = False) -> str:
    """Pick a model.

    Sonnet 4.6 is the default for everything that involves tool use,
    multi-step reasoning, or diagnostic guidance. Haiku 4.5 is reserved
    for short clarification turns (e.g. asking the user a yes/no
    follow-up) where latency matters more than depth.
    """
    if short_clarification:
        return SHORT_CLARIFICATION_MODEL
    return DEFAULT_MODEL
