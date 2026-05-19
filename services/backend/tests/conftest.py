from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest

# Configure auth settings BEFORE importing the app so Settings() picks them up.
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod-needs-32-bytes-minimum")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("AUTH_RATE_LIMIT", "1000/minute")
os.environ.setdefault("AI_RATE_LIMIT", "1000/hour")
os.environ.setdefault("DB_PATH", ":memory:")


import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield SessionLocal
    finally:
        await engine.dispose()


@pytest.fixture
async def client(session_factory) -> AsyncIterator[httpx.AsyncClient]:
    async def _override_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
