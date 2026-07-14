"""Running Alembic migrations at boot.

The delicate part is not the migrations themselves — it is the **first** boot after Alembic was
introduced.

A database created before Alembic existed has every table (they were made by
`Base.metadata.create_all`) but no `alembic_version` row. Running `upgrade head` against it
would start at `0001_baseline`, try to `CREATE TABLE users`, and fail against a database that
already holds real exams.

So: if the schema is already there but unversioned, it is **stamped** at the baseline first —
telling Alembic "this database is already at 0001" — and only then upgraded. A genuinely empty
database has nothing to stamp and is simply built from the migrations.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.config import get_settings

log = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
BASELINE = "0001"

# Any table from the pre-Alembic schema will do; `users` has existed since the first commit.
SENTINEL_TABLE = "users"


def _config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    return config


def run_migrations() -> None:
    """Bring the database up to head, adopting a pre-Alembic one if that is what we find.

    Synchronous, and builds its own engine: Alembic drives DDL itself (see migrations/env.py),
    and running it inside the app's async engine would mean nesting an event loop in the one
    already running. It is called once, at boot, before anything serves a request.
    """
    engine = create_engine(f"sqlite:///{get_settings().db_path}")

    try:
        tables = set(inspect(engine).get_table_names())
        has_schema = SENTINEL_TABLE in tables
        is_versioned = "alembic_version" in tables

        config = _config()

        if has_schema and not is_versioned:
            # A database from before Alembic existed. Adopt it rather than trying to rebuild
            # it: `upgrade head` would start at the baseline and CREATE TABLE users against a
            # database that already holds real exams.
            log.info("adopting a pre-Alembic database: stamping it at %s", BASELINE)
            command.stamp(config, BASELINE)

        with engine.connect() as connection:
            before = MigrationContext.configure(connection).get_current_revision()

        command.upgrade(config, "head")

        with engine.connect() as connection:
            after = MigrationContext.configure(connection).get_current_revision()

        if before != after:
            log.info("database migrated: %s -> %s", before or "empty", after)
        else:
            log.debug("database already at %s", after)
    finally:
        engine.dispose()
