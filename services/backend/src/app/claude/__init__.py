"""Claude API client wrapper.

Thin async layer over the Anthropic SDK that:
  • streams `messages.stream(...)` responses for the tool dispatcher (T3.4)
  • routes between Sonnet 4.6 (default) and Haiku 4.5 (short clarifications)
  • exposes cache-breakpoint helpers so the system prompt builder (T3.5)
    can mark stable content blocks for prompt caching

Downstream tasks (T3.4 tool dispatcher, T3.5 system prompt builder)
consume `ClaudeClient` and the cache helpers — they do not import the
Anthropic SDK directly.
"""

from .caching import (
    apply_cache_breakpoint,
    cache_breakpoint_text,
    mark_last_block_cached,
)
from .client import ClaudeClient
from .dispatcher import (
    DEFAULT_MAX_ITERATIONS,
    DEFAULT_MAX_TOOL_RESULT_BYTES,
    DEFAULT_TOOL_TIMEOUT_SECONDS,
    WRITE_TOOLS,
    DispatcherEvent,
    TextDelta,
    ToolCallCompleted,
    ToolCallDispatched,
    ToolCallError,
    TurnComplete,
    run_assistant_turn,
)
from .models import (
    DEFAULT_MODEL,
    SHORT_CLARIFICATION_MODEL,
    ClaudeModel,
    route_model,
)
from .transport import ToolTransport, ToolTransportError, WebSocketToolTransport

__all__ = [
    "ClaudeClient",
    "ClaudeModel",
    "DEFAULT_MAX_ITERATIONS",
    "DEFAULT_MAX_TOOL_RESULT_BYTES",
    "DEFAULT_MODEL",
    "DEFAULT_TOOL_TIMEOUT_SECONDS",
    "DispatcherEvent",
    "SHORT_CLARIFICATION_MODEL",
    "TextDelta",
    "ToolCallCompleted",
    "ToolCallDispatched",
    "ToolCallError",
    "ToolTransport",
    "ToolTransportError",
    "TurnComplete",
    "WRITE_TOOLS",
    "WebSocketToolTransport",
    "apply_cache_breakpoint",
    "cache_breakpoint_text",
    "mark_last_block_cached",
    "route_model",
    "run_assistant_turn",
]
