"""Claude API client wrapper.

Thin async layer over the Anthropic SDK that:
  • streams `messages.stream(...)` responses for the tool dispatcher (T3.4)
  • routes between Sonnet 4.6 (default) and Haiku 4.5 (short clarifications)
  • exposes cache-breakpoint helpers so the system prompt builder (T3.5)
    can mark stable content blocks for prompt caching
  • tracks per-session token usage and auto-summarizes when approaching the
    context limit (T3.8)

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
from .context import (
    ConversationContextManager,
    TokenUsage,
    build_messages_from_summary,
)
from .dispatcher import (
    DEFAULT_MAX_ITERATIONS,
    DEFAULT_MAX_PAUSE_CONTINUATIONS,
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
from .prompt import build_system_prompt
from .tools import (
    AUTOMOTIVE_SEARCH_DOMAINS,
    DEFAULT_TOOLS,
    OBD_TOOL_NAMES,
    OBD_TOOLS,
    READABLE_PIDS,
    WEB_SEARCH_MAX_USES,
    WEB_SEARCH_TOOL,
)
from .transport import ToolTransport, ToolTransportError, WebSocketToolTransport
from .vin_decoder import DecodedVin, decode_vin, resolve_make

__all__ = [
    "AUTOMOTIVE_SEARCH_DOMAINS",
    "ClaudeClient",
    "DecodedVin",
    "ConversationContextManager",
    "TokenUsage",
    "build_messages_from_summary",
    "ClaudeModel",
    "DEFAULT_MAX_ITERATIONS",
    "DEFAULT_MAX_PAUSE_CONTINUATIONS",
    "DEFAULT_MAX_TOOL_RESULT_BYTES",
    "DEFAULT_MODEL",
    "DEFAULT_TOOLS",
    "DEFAULT_TOOL_TIMEOUT_SECONDS",
    "DispatcherEvent",
    "OBD_TOOLS",
    "OBD_TOOL_NAMES",
    "READABLE_PIDS",
    "SHORT_CLARIFICATION_MODEL",
    "TextDelta",
    "ToolCallCompleted",
    "ToolCallDispatched",
    "ToolCallError",
    "ToolTransport",
    "ToolTransportError",
    "TurnComplete",
    "WEB_SEARCH_MAX_USES",
    "WEB_SEARCH_TOOL",
    "WRITE_TOOLS",
    "WebSocketToolTransport",
    "apply_cache_breakpoint",
    "build_system_prompt",
    "cache_breakpoint_text",
    "decode_vin",
    "resolve_make",
    "mark_last_block_cached",
    "route_model",
    "run_assistant_turn",
]
