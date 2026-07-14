"""Migrations — and specifically, adopting a database that predates Alembic.

This is the highest-consequence code in the project. Every existing DICOMium install has a
database full of real medical images, created by `Base.metadata.create_all`, with no
`alembic_version` table. If `upgrade head` were run against it blindly, it would start at the
baseline, try to `CREATE TABLE users`, and fail — leaving the app unable to boot.

A test that only exercises a *fresh* database would pass while shipping exactly that.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text

from app.db.base import Base
from app.db.migrate import BASELINE, run_migrations
from app.models import *  # noqa: F401,F403 - registers every table on Base.metadata


def _columns(db_path, table: str) -> set[str]:
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        return {c["name"] for c in inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def _tables(db_path) -> set[str]:
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _revision(db_path) -> str | None:
    engine = create_engine(f"sqlite:///{db_path}")
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            return row[0] if row else None
    finally:
        engine.dispose()


@pytest.fixture
def db_path(isolated_settings):
    from app.config import get_settings

    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings.db_path


def _build_pre_alembic_database(db_path) -> None:
    """Recreate exactly what a live pre-Alembic install looks like."""
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)

    with engine.begin() as conn:
        # The models now carry `language`; a database from before that migration did not.
        conn.execute(text("ALTER TABLE user_preferences DROP COLUMN language"))
        conn.execute(
            text(
                "INSERT INTO users (email, password_hash, slug, is_admin, is_active, created_at)"
                " VALUES ('old@example.com', 'hash', 'old', 1, 1, '2026-01-01')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO user_preferences (user_id, avatar_style, avatar_color, use_gravatar,"
                " created_at) VALUES (1, 'solid', 'rose', 0, '2026-01-01')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO studies (user_id, study_instance_uid, patient_name, patient_id,"
                " modalities, num_series, num_instances, dir_path, created_at)"
                " VALUES (1, '1.2.3', 'DOE^JANE', 'A1', 'CT', 7, 1138, 'x', '2026-01-01')"
            )
        )
    engine.dispose()


class TestAdoptingAPreAlembicDatabase:
    def test_the_fixture_really_is_pre_alembic(self, db_path):
        # Guard the guard: if this ever stops being true, the test below proves nothing.
        _build_pre_alembic_database(db_path)

        assert "users" in _tables(db_path)
        assert "alembic_version" not in _tables(db_path)
        assert "language" not in _columns(db_path, "user_preferences")

    def test_it_is_adopted_migrated_and_keeps_its_data(self, db_path):
        _build_pre_alembic_database(db_path)

        run_migrations()

        # Stamped, then upgraded — not rebuilt.
        assert _revision(db_path) == "0002"
        assert "language" in _columns(db_path, "user_preferences")

        # The point of the whole exercise: the exams are still there.
        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM studies")).scalar_one() == 1
            assert (
                conn.execute(text("SELECT email FROM users")).scalar_one() == "old@example.com"
            )
            # An untouched preference must survive, and the new column defaults to NULL —
            # "follow the browser", not a silently pinned language.
            color, language = conn.execute(
                text("SELECT avatar_color, language FROM user_preferences")
            ).first()
            assert color == "rose"
            assert language is None
        engine.dispose()

    def test_running_it_twice_is_a_no_op(self, db_path):
        _build_pre_alembic_database(db_path)

        run_migrations()
        run_migrations()  # every subsequent boot

        assert _revision(db_path) == "0002"
        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            assert conn.execute(text("SELECT COUNT(*) FROM studies")).scalar_one() == 1
        engine.dispose()


class TestFreshDatabase:
    def test_it_is_built_entirely_from_the_migrations(self, db_path):
        assert not db_path.exists()

        run_migrations()

        tables = _tables(db_path)
        for expected in ("users", "studies", "series", "instances", "user_preferences"):
            assert expected in tables
        assert _revision(db_path) == "0002"
        assert "language" in _columns(db_path, "user_preferences")

    def test_a_fresh_database_is_never_stamped_at_the_baseline(self, db_path):
        # It has nothing to adopt: it must be *built* by 0001, not declared already-at-0001.
        run_migrations()
        assert _revision(db_path) != BASELINE
