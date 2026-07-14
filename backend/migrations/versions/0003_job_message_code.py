"""Add a translatable code to upload job messages.

The backend used to build the job summary as prose — "Imported 1138 files; 40 non-DICOM files
ignored" — by joining optional clauses with "; ". That sentence cannot be translated: its shape
differs per language and its clauses pluralise differently. The counts were already on the row,
so the browser now composes the sentence itself and the backend sends only a terminal code.

`message` stays, in English, for logs and for API consumers that do not translate.

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default is what makes this safe on a table that already holds jobs: a NOT NULL
    # column with no default cannot be added to a populated table. Existing rows get "", which
    # the client reads as "no code — fall back to the English message".
    with op.batch_alter_table("upload_jobs", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("message_code", sa.String(length=64), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("upload_jobs", schema=None) as batch_op:
        batch_op.drop_column("message_code")
