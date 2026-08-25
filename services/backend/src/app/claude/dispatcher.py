"""Tool dispatcher — the agentic streaming loop.

Coordinates `ClaudeClient.stream(...)` with phone-side tool execution.

Lifecycle of one assistant turn:

  1. Open a streaming Messages request against the model.
  2. As `content_block_delta` events with `text_delta` arrive, surface them
     to the caller as `TextDelta` events (so the WS layer can pipe partial
     text to the phone for live UX).
  3. After the SDK stream ends, pull the assembled `Message` via
     `stream.get_final_message()`. It has fully-parsed `ToolUseBlock`s.
  4. If `stop_reason != "tool_use"` the turn is terminal — emit
     `TurnComplete` and return.
  5. Otherwise dispatch each tool_use through the `ToolTransport` with a
     bounded wait (`tool_timeout`, default 5 s). Oversized payloads are
     truncated with a `[truncated]` marker before being injected as
     `tool_result` blocks.
  6. Write tools (`WRITE_TOOLS`, currently `{"clear_dtcs"}`) are refused
     unless `input["confirmed"]` is true AND the tool name appears in the
     caller-supplied `confirmed_writes` allowlist. The dispatcher injects
     a synthetic `is_error: true` tool_result so Claude can ask the user
     to confirm rather than silently looping.
  7. Append the assistant turn (raw SDK content blocks) and a user turn
     (tool_result list) to `messages`, then loop.

The dispatcher mutates the supplied `messages` list in place. The caller
owns persistence — typically the WS handler appends the user prompt before
calling and reads `messages` after each turn for journaling.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from typing import Any, Literal

import structlog

from .client import ClaudeClient
from .transport import ToolTransport, ToolTransportError

log = structlog.get_logger(__name__)


# Tools the dispatcher refuses to execute without an out-of-band confirmation
# signal from the user. Mirrors `clear_dtcs` in packages/obd-protocol.
WRITE_TOOLS: frozenset[str] = frozenset({"clear_dtcs"})

DEFAULT_TOOL_TIMEOUT_SECONDS: float = 5.0
# Anthropic accepts arbitrarily large `content` strings in tool_result, but
# wide histories crowd the context window. Keep results compact; the phone
# is the source of truth and can be re-queried.
DEFAULT_MAX_TOOL_RESULT_BYTES: int = 16_384
DEFAULT_MAX_ITERATIONS: int = 8
# Server-side tools (web search) can return `stop_reason: "pause_turn"` when a
# turn runs long: the work is mid-flight and the API wants the paused assistant
# message sent back unchanged to resume. Without a branch for it the loop treats
# the pause as terminal and the user gets a sentence that stops mid-thought, with
# no error anywhere. Pauses are capped separately from the tool budget because
# they are not tool round-trips.
DEFAULT_MAX_PAUSE_CONTINUATIONS: int = 4

_TRUNCATION_MARKER: str = "\n[truncated]"


# ── Events the dispatcher yields ──────────────────────────────────────────────


@dataclass(frozen=True)
class TextDelta:
    text: str
    type: Literal["text_delta"] = "text_delta"


@dataclass(frozen=True)
class ToolCallDispatched:
    tool_use_id: str
    name: str
    input: dict[str, Any]
    type: Literal["tool_call_dispatched"] = "tool_call_dispatched"


@dataclass(frozen=True)
class ToolCallCompleted:
    tool_use_id: str
    name: str
    elapsed_ms: int
    truncated: bool
    type: Literal["tool_call_completed"] = "tool_call_completed"


@dataclass(frozen=True)
class ToolCallError:
    tool_use_id: str
    name: str
    reason: Literal["timeout", "transport_error", "confirmation_required", "unknown_tool"]
    message: str
    type: Literal["tool_call_error"] = "tool_call_error"


@dataclass(frozen=True)
class TurnComplete:
    stop_reason: str
    iterations: int
    input_tokens: int = 0
    output_tokens: int = 0
    type: Literal["turn_complete"] = "turn_complete"


DispatcherEvent = TextDelta | ToolCallDispatched | ToolCallCompleted | ToolCallError | TurnComplete


# ── Helpers ───────────────────────────────────────────────────────────────────


def _truncate_for_anthropic(payload: Any, *, max_bytes: int) -> tuple[str, bool]:
    """Serialise `payload` for a tool_result block.

    Returns `(content, truncated)`. Strings are passed through; everything
    else is JSON-encoded. If the UTF-8 byte length exceeds `max_bytes`, the
    string is sliced (respecting UTF-8 boundaries) and a marker is appended.
    """
    if isinstance(payload, str):
        text = payload
    else:
        text = json.dumps(payload, ensure_ascii=False, default=str)

    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text, False

    marker_bytes = _TRUNCATION_MARKER.encode("utf-8")
    budget = max(0, max_bytes - len(marker_bytes))
    clipped = encoded[:budget].decode("utf-8", errors="ignore")
    return clipped + _TRUNCATION_MARKER, True


def _block_to_dict(block: Any) -> dict[str, Any]:
    """Coerce an SDK content block (pydantic model) into a plain dict.

    Tests pass plain dicts; the SDK passes typed models. Both must round-trip
    cleanly back into a future `messages` payload.
    """
    if isinstance(block, dict):
        return block
    if hasattr(block, "model_dump"):
        return block.model_dump(exclude_none=True)
    # Last-resort duck-typing for hand-rolled fakes.
    return {
        k: getattr(block, k)
        for k in ("type", "id", "name", "input", "text", "citations")
        if hasattr(block, k) and getattr(block, k) is not None
    }


def _is_tool_use_block(block: Any) -> bool:
    block_type = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
    return block_type == "tool_use"


def _tool_use_input(block: Any) -> dict[str, Any]:
    raw = block["input"] if isinstance(block, dict) else getattr(block, "input", {})
    if isinstance(raw, dict):
        return raw
    if hasattr(raw, "model_dump"):
        return raw.model_dump()
    return dict(raw) if raw is not None else {}


def _attr(block: Any, name: str) -> Any:
    return block[name] if isinstance(block, dict) else getattr(block, name)


# ── Main entry point ──────────────────────────────────────────────────────────


async def run_assistant_turn(
    *,
    client: ClaudeClient,
    transport: ToolTransport,
    messages: list[dict[str, Any]],
    system: str | list[dict[str, Any]] | None = None,
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    short_clarification: bool = False,
    max_tokens: int = 4096,
    confirmed_writes: Iterable[str] | None = None,
    tool_timeout: float = DEFAULT_TOOL_TIMEOUT_SECONDS,
    max_tool_result_bytes: int = DEFAULT_MAX_TOOL_RESULT_BYTES,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    max_pause_continuations: int = DEFAULT_MAX_PAUSE_CONTINUATIONS,
    extra_headers: dict[str, str] | None = None,
) -> AsyncIterator[DispatcherEvent]:
    """Run one assistant turn (potentially multi-step with tool calls).

    Yields a sequence of `DispatcherEvent`s. `messages` is mutated in place
    to record every assistant and tool_result turn the loop produces.
    """
    confirmed = frozenset(confirmed_writes or ())
    iterations = 0
    pause_continuations = 0
    last_stop_reason: str = "unknown"
    total_input_tokens: int = 0
    total_output_tokens: int = 0

    # A resumed pause costs another request but no tool round-trip, so it
    # extends the budget rather than spending it — otherwise a search-heavy
    # turn would starve the phone-side tool calls that follow it.
    while iterations < max_iterations + pause_continuations:
        iterations += 1

        async with client.stream(
            messages=messages,
            system=system,
            tools=tools,
            model=model,
            short_clarification=short_clarification,
            max_tokens=max_tokens,
            extra_headers=extra_headers,
        ) as stream:
            async for event in stream:
                # Stream only text deltas — tool_use input arrives via
                # `input_json_delta` events, but the SDK assembles them
                # into the final Message for us, so we don't need to
                # accumulate partial JSON here.
                event_type = getattr(event, "type", None)
                if event_type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta is not None and getattr(delta, "type", None) == "text_delta":
                        text = getattr(delta, "text", "")
                        if text:
                            yield TextDelta(text=text)

            final_message = await stream.get_final_message()

        usage = getattr(final_message, "usage", None)
        if usage is not None:
            total_input_tokens += getattr(usage, "input_tokens", 0)
            total_output_tokens += getattr(usage, "output_tokens", 0)

        stop_reason: str = getattr(final_message, "stop_reason", None) or "end_turn"
        last_stop_reason = stop_reason
        content_blocks = list(getattr(final_message, "content", []) or [])

        # Persist the assistant turn so the next iteration sees it.
        messages.append(
            {
                "role": "assistant",
                "content": [_block_to_dict(b) for b in content_blocks],
            }
        )

        if stop_reason == "pause_turn":
            # The assistant turn is already appended verbatim above, which is
            # exactly what resuming requires — just ask again.
            if pause_continuations >= max_pause_continuations:
                log.warning(
                    "dispatcher_max_pause_continuations_exceeded",
                    pause_continuations=pause_continuations,
                )
                break
            pause_continuations += 1
            continue

        if stop_reason != "tool_use":
            break

        tool_use_blocks = [b for b in content_blocks if _is_tool_use_block(b)]
        if not tool_use_blocks:
            # Defensive: stop_reason claimed tool_use but no blocks present.
            log.warning("dispatcher_tool_use_with_no_blocks", iterations=iterations)
            break

        tool_results: list[dict[str, Any]] = []
        for block in tool_use_blocks:
            tool_use_id: str = _attr(block, "id")
            name: str = _attr(block, "name")
            tool_input: dict[str, Any] = _tool_use_input(block)

            if name in WRITE_TOOLS:
                if not (tool_input.get("confirmed") is True and name in confirmed):
                    msg = (
                        f"Tool '{name}' is a write operation. The user has not confirmed "
                        "this action. Ask the user for explicit confirmation, then retry."
                    )
                    yield ToolCallError(
                        tool_use_id=tool_use_id,
                        name=name,
                        reason="confirmation_required",
                        message=msg,
                    )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "is_error": True,
                            "content": msg,
                        }
                    )
                    continue

            yield ToolCallDispatched(tool_use_id=tool_use_id, name=name, input=tool_input)

            t0 = time.monotonic()
            try:
                payload = await asyncio.wait_for(
                    transport.call(tool_use_id=tool_use_id, name=name, input=tool_input),
                    timeout=tool_timeout,
                )
            except TimeoutError:
                elapsed_ms = int((time.monotonic() - t0) * 1000)
                msg = f"Tool '{name}' did not respond within {tool_timeout:.1f}s"
                yield ToolCallError(
                    tool_use_id=tool_use_id, name=name, reason="timeout", message=msg
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "is_error": True,
                        "content": msg,
                    }
                )
                log.warning(
                    "dispatcher_tool_timeout",
                    tool=name,
                    tool_use_id=tool_use_id,
                    elapsed_ms=elapsed_ms,
                )
                continue
            except ToolTransportError as exc:
                msg = f"Tool '{name}' failed: {exc}"
                yield ToolCallError(
                    tool_use_id=tool_use_id,
                    name=name,
                    reason="transport_error",
                    message=msg,
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "is_error": True,
                        "content": msg,
                    }
                )
                continue

            elapsed_ms = int((time.monotonic() - t0) * 1000)
            content, truncated = _truncate_for_anthropic(payload, max_bytes=max_tool_result_bytes)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                }
            )
            yield ToolCallCompleted(
                tool_use_id=tool_use_id,
                name=name,
                elapsed_ms=elapsed_ms,
                truncated=truncated,
            )

        messages.append({"role": "user", "content": tool_results})

    if iterations >= max_iterations + pause_continuations and last_stop_reason == "tool_use":
        # Model kept asking for tools beyond the safety cap. Stop here so we
        # don't burn unbounded credits; the caller can render the partial
        # transcript and ask the user how to proceed.
        log.warning(
            "dispatcher_max_iterations_exceeded",
            iterations=iterations,
            max_iterations=max_iterations,
        )

    yield TurnComplete(
        stop_reason=last_stop_reason,
        iterations=iterations,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
    )
