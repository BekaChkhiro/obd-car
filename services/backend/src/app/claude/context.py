"""Conversation context manager — token budget tracking and auto-summarization.

Tracks per-session token usage (input + cache creation + cache read + output).
When the accumulated count approaches the model's context limit, older messages
are replaced with a Haiku 4.5-generated summary so the window stays within
budget for the rest of the session.

What is always kept verbatim
-----------------------------
* The system prompt (passed separately to ``ClaudeClient.stream`` — not managed here).
* The last ``keep_last_n_turns`` user + assistant pairs (default 6 = 12 messages).

What is compressed
------------------
* All earlier turns (everything before the last N pairs).

The summary replaces the old turns as a two-message pair::

    {"role": "user", "content": "[Summary of earlier conversation]\\n<text>"}
    {"role": "assistant", "content": "Understood. I'll continue from here."}

Persistence
-----------
``last_summary`` is set after each compression. Callers (typically the WS
session handler) should persist it to ``DiagnosticSession.context_summary``
so that session reloads can pre-populate the message list with the summary
instead of starting from scratch. Use ``build_messages_from_summary`` to
reconstruct the initial list on reload.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog

from .client import ClaudeClient
from .models import SHORT_CLARIFICATION_MODEL

log = structlog.get_logger(__name__)

_SUMMARY_SYSTEM_PROMPT = (
    "Summarize the conversation below between a user and an automotive diagnostic AI assistant. "
    "Include: vehicle symptoms and issues described, diagnostic trouble codes found, "
    "sensor readings retrieved, any write operations (e.g. clearing codes) performed, "
    "and next steps or recommendations given. Be concise but complete. "
    "The summary will replace this portion of the conversation history."
)

# claude-sonnet-4-6 and claude-haiku-4-5-20251001 both have a 200K token window.
_MODEL_CONTEXT_TOKENS: int = 200_000
# Trigger compression at 75% of the window to leave headroom for the next turn.
_DEFAULT_THRESHOLD: int = int(_MODEL_CONTEXT_TOKENS * 0.75)
# Keep this many user+assistant pairs verbatim (each pair = 2 messages).
_DEFAULT_KEEP_LAST_TURNS: int = 6


@dataclass
class TokenUsage:
    """Accumulated token counts for one session across multiple turns."""

    input_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    output_tokens: int = 0

    @property
    def total(self) -> int:
        return (
            self.input_tokens
            + self.cache_creation_tokens
            + self.cache_read_tokens
            + self.output_tokens
        )

    def update_from(self, usage: Any) -> None:
        """Add counts from an Anthropic ``Usage`` object (duck-typed).

        Anthropic SDK field names: ``input_tokens``, ``cache_creation_input_tokens``,
        ``cache_read_input_tokens``, ``output_tokens``. Missing fields are treated as 0.
        """
        self.input_tokens += getattr(usage, "input_tokens", 0) or 0
        self.cache_creation_tokens += getattr(usage, "cache_creation_input_tokens", 0) or 0
        self.cache_read_tokens += getattr(usage, "cache_read_input_tokens", 0) or 0
        self.output_tokens += getattr(usage, "output_tokens", 0) or 0


def build_messages_from_summary(summary: str) -> list[dict[str, Any]]:
    """Build the initial message pair for a session with a persisted summary.

    Call this on session reload when ``DiagnosticSession.context_summary`` is set,
    then append the actual recent messages on top::

        messages = build_messages_from_summary(session.context_summary)
        messages.extend(recent_turn_messages)
    """
    return [
        {"role": "user", "content": f"[Summary of earlier conversation]\n{summary}"},
        {"role": "assistant", "content": "Understood. I'll continue from here."},
    ]


class ConversationContextManager:
    """Tracks token usage and compresses the message list when the budget is tight.

    Parameters
    ----------
    client:
        ``ClaudeClient`` instance — used only for the Haiku summary call.
    compress_threshold:
        Cumulative token count that triggers compression (default: 150 000,
        which is 75% of the 200K claude-sonnet-4-6 / haiku-4-5 context window).
    keep_last_n_turns:
        Number of full user + assistant turn pairs to keep verbatim after
        compression (default: 6 turns = 12 messages). Must be ≥ 1.
    """

    def __init__(
        self,
        *,
        client: ClaudeClient,
        compress_threshold: int = _DEFAULT_THRESHOLD,
        keep_last_n_turns: int = _DEFAULT_KEEP_LAST_TURNS,
    ) -> None:
        self._client = client
        self._threshold = compress_threshold
        self._keep = keep_last_n_turns
        self.usage: TokenUsage = TokenUsage()
        self.last_summary: str | None = None

    @property
    def should_compress(self) -> bool:
        """True when accumulated tokens have reached the compression threshold."""
        return self.usage.total >= self._threshold

    def record_usage(self, usage: Any) -> None:
        """Accumulate token counts from an Anthropic ``Usage`` object."""
        self.usage.update_from(usage)

    async def maybe_compress(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Return the (possibly compressed) message list.

        If ``should_compress`` is False the original list is returned unchanged.
        When compression runs, ``last_summary`` is updated and a new list is
        returned with old turns replaced by a summary pair.
        """
        if not self.should_compress:
            return messages
        return await self._compress(messages)

    async def _compress(
        self,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        keep_count = self._keep * 2  # one user + one assistant per turn

        if len(messages) <= keep_count:
            # History is too short to have an "old" portion — nothing to summarize.
            return messages

        old = messages[:-keep_count]
        recent = messages[-keep_count:]

        try:
            summary = await self._summarize(old)
        except Exception:
            log.warning(
                "context_compress_summary_failed",
                old_message_count=len(old),
            )
            # Best-effort: return the original list rather than silently losing history.
            return messages

        self.last_summary = summary
        log.info(
            "context_compressed",
            old_message_count=len(old),
            recent_message_count=len(recent),
            summary_chars=len(summary),
        )
        return build_messages_from_summary(summary) + recent

    async def _summarize(self, messages: list[dict[str, Any]]) -> str:
        summarize_messages: list[dict[str, Any]] = list(messages) + [
            {"role": "user", "content": "Please summarize the conversation above."},
        ]

        async with self._client.stream(
            messages=summarize_messages,
            system=_SUMMARY_SYSTEM_PROMPT,
            model=SHORT_CLARIFICATION_MODEL,
            max_tokens=1024,
        ) as stream:
            # Drain events so the SDK connection stays healthy; text is read
            # from the assembled final message below.
            async for _ in stream:
                pass
            final = await stream.get_final_message()

        for block in getattr(final, "content", []) or []:
            if getattr(block, "type", None) == "text":
                text: str = getattr(block, "text", "") or ""
                if text:
                    return text

        return ""
