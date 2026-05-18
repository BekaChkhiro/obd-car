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
from .models import (
    DEFAULT_MODEL,
    SHORT_CLARIFICATION_MODEL,
    ClaudeModel,
    route_model,
)

__all__ = [
    "ClaudeClient",
    "ClaudeModel",
    "DEFAULT_MODEL",
    "SHORT_CLARIFICATION_MODEL",
    "apply_cache_breakpoint",
    "cache_breakpoint_text",
    "mark_last_block_cached",
    "route_model",
]
