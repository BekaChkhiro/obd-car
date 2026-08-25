import asyncio
import sqlite3
from collections.abc import AsyncIterator
from contextlib import closing
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_dir(db_path: str) -> None:
    parent = Path(db_path).parent
    if parent and str(parent) not in ("", "."):
        parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_dir(settings.db_path)

engine = create_async_engine(settings.database_url, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# Revisions matched to a column or table that only exists once they have run.
# Ordered oldest first; the newest match is where an unstamped database is.
_REVISION_MARKERS: tuple[tuple[str, str, str | None], ...] = (
    ("0001", "users", None),
    ("0002", "diagnostic_sessions", "context_summary"),
    ("0003", "users", "display_name"),
    ("0004", "password_reset_codes", None),
)


def _detect_existing_revision(connection: sqlite3.Connection) -> str | None:
    """Work out how far an unstamped database has already been taken.

    Returns ``None`` for a database that is genuinely empty, which Alembic can
    migrate from scratch.
    """
    tables = {
        row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    found: str | None = None
    for revision, table, column in _REVISION_MARKERS:
        if table not in tables:
            break
        if column is not None:
            columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            if column not in columns:
                break
        found = revision
    return found


def _stamp_if_unversioned(db_path: str) -> None:
    """Give Alembic a starting point on a database that predates it.

    Early releases built their schema with ``create_all`` alone, so production
    has the tables but no ``alembic_version`` row. Left as-is, Alembic assumes
    an empty database and replays 0001, which dies on ``table users already
    exists`` — and the boot fails on a database that was perfectly healthy.

    Stamping is written directly rather than through ``command.stamp`` because
    that would need a second engine against a file this process is about to
    open anyway.
    """
    if not Path(db_path).exists():
        return

    with closing(sqlite3.connect(db_path)) as connection:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "alembic_version" in tables:
            already = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            if already:
                return

        revision = _detect_existing_revision(connection)
        if revision is None:
            return

        connection.execute(
            "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"
        )
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def _run_migrations_sync() -> None:
    """Bring the schema up to head with Alembic.

    Synchronous and run in a worker thread: Alembic drives its own engine, and
    calling it directly from the running event loop deadlocks on SQLite.
    """
    from alembic import command
    from alembic.config import Config

    _stamp_if_unversioned(settings.db_path)

    ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    config = Config(str(ini))
    config.set_main_option("script_location", str(ini.parent / "migrations"))
    command.upgrade(config, "head")


async def init_db() -> None:
    """Converge the database schema before the app serves a single request.

    Migrations first, then ``create_all``. Both are needed and neither is
    redundant: ``create_all`` adds tables that are missing but silently leaves
    an existing table alone, so a column added to one only ever arrives through
    a migration — deploying without it takes down every query that selects the
    table. ``create_all`` still runs afterwards for the case Alembic cannot
    cover, a brand-new database with no version table at all (tests, a fresh
    volume), where stamping is not yet possible.

    A failure here is deliberately fatal. A process that starts against a
    half-migrated database answers requests with column errors, which is worse
    than a boot that fails loudly and leaves the previous release serving.
    """
    from . import models  # noqa: F401  (registers mappers)

    await asyncio.to_thread(_run_migrations_sync)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
