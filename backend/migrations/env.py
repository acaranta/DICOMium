"""Alembic environment.

Runs migrations synchronously against the same SQLite file the app uses. Alembic's async
support exists, but the app only ever calls it once at boot, from `init_db()` — running it on a
plain sync engine is simpler and avoids nesting an event loop inside the running one.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.db.base import Base
from app.models import *  # noqa: F401,F403 - registers every table on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    """The app's own database path — never a URL hardcoded in alembic.ini."""
    return f"sqlite:///{get_settings().db_path}"


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite cannot ALTER a column in place; batch mode rebuilds the table instead.
            # Plain ADD COLUMN does not need it, but a future ALTER would fail silently
            # without it.
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
