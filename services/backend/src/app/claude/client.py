"""Async streaming wrapper around the Anthropic SDK.

This is the only module in the app that imports the Anthropic SDK
directly. The tool dispatcher (T3.4) consumes `ClaudeClient.stream(...)`
as an async iterator of raw SDK events; it handles interleaving of
text and tool_use blocks within a single assistant turn.

Design notes:
  • We use `client.messages.stream(...)` so callers get an `AsyncIterator`
    of typed SDK events (`MessageStartEvent`, `ContentBlockDeltaEvent`,
    ...). This matches what the dispatcher needs without an intermediate
    abstraction.
  • Prompt caching is opt-in per content block via `cache_control`. The
    caller marks blocks with `caching.cache_breakpoint_text` / friends —
    no global header is required (prompt caching is GA).
  • The wrapper is stateless across calls; one instance per process is
    fine because `AsyncAnthropic` shares an HTTPX connection pool.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from anthropic import AsyncAnthropic

from ..config import settings
from .models import DEFAULT_MODEL, route_model


class ClaudeClient:
    """Async wrapper around `anthropic.AsyncAnthropic`."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        default_model: str = DEFAULT_MODEL,
        client: AsyncAnthropic | None = None,
    ) -> None:
        # `client` is for injection in tests; production callers pass an
        # api_key (or rely on settings).
        if client is not None:
            self._client = client
        else:
            self._client = AsyncAnthropic(api_key=api_key or settings.anthropic_api_key or None)
        self._default_model = default_model

    @property
    def default_model(self) -> str:
        return self._default_model

    def pick_model(self, *, short_clarification: bool = False) -> str:
        """Route between Sonnet (default) and Haiku (short clarification)."""
        return route_model(short_clarification=short_clarification)

    @asynccontextmanager
    async def stream(
        self,
        *,
        messages: list[dict[str, Any]],
        system: str | list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        short_clarification: bool = False,
        extra_headers: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        """Open a streaming Messages call as an async context manager.

        Yields the SDK's stream object; iterate it with `async for event in stream:`
        to get `MessageStartEvent`, `ContentBlockStartEvent`,
        `ContentBlockDeltaEvent`, `ContentBlockStopEvent`,
        `MessageDeltaEvent`, `MessageStopEvent`.

        Usage::

            async with client.stream(messages=msgs, system=sys, tools=tools) as s:
                async for event in s:
                    ...

        `model` overrides routing; otherwise `short_clarification` picks
        Haiku, default picks Sonnet.
        """
        chosen_model = model or self.pick_model(short_clarification=short_clarification)
        request: dict[str, Any] = {
            "model": chosen_model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system is not None:
            request["system"] = system
        if tools:
            request["tools"] = tools
        if extra_headers:
            request["extra_headers"] = extra_headers
        request.update(kwargs)

        async with self._client.messages.stream(**request) as stream:
            yield stream
