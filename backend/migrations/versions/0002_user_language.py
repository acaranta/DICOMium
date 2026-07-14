"""Add a language preference.

NULL means "follow the browser" — an explicit state, not a missing one. A user who has never
chosen a language should track their browser's setting if they later change it, which a
defaulted 'en' would silently prevent.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A plain ADD COLUMN, which SQLite supports natively. This is the whole reason Alembic was
    # introduced: create_all would have silently skipped it on every existing database.
    op.add_column(
        "user_preferences",
        sa.Column("language", sa.String(8), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("user_preferences") as batch:
        batch.drop_column("language")
