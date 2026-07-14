"""Per-user preferences.

A separate table, not columns on `users`. There is no Alembic here, and
`Base.metadata.create_all` creates new TABLES but never adds COLUMNS to existing ones — so a
column on `users` would silently fail to appear and then blow up at runtime against a database
that already holds real exams.

It is also simply the better model: preferences are optional, they grow over time (the roadmap's
i18n work will want a language here), and a user without a row is a perfectly valid state — they
just get the defaults.
"""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# The avatar palette. Chosen to read clearly on the dark instrument chrome — every one of these
# carries white initials at legible contrast.
AVATAR_COLORS: tuple[str, ...] = (
    "cyan",
    "teal",
    "emerald",
    "violet",
    "indigo",
    "amber",
    "rose",
    "slate",
)

AVATAR_STYLES: tuple[str, ...] = (
    "solid",
    "ring",
    "gradient",
    "pattern",
)

DEFAULT_COLOR = "cyan"
DEFAULT_STYLE = "solid"

# The languages the interface is translated into. A user's stored value must be one of these,
# or NULL for "follow the browser".
LANGUAGES: tuple[str, ...] = ("en", "fr", "de", "es", "it")


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )

    avatar_style: Mapped[str] = mapped_column(String(16), default=DEFAULT_STYLE)
    avatar_color: Mapped[str] = mapped_column(String(16), default=DEFAULT_COLOR)

    # NULL means "follow the browser" — an explicit state, not a missing one. Defaulting to
    # "en" would silently pin a user who never chose a language, so that later changing their
    # browser's language would have no effect.
    language: Mapped[str | None] = mapped_column(String(8), default=None)

    # Off by default, and it must stay that way. Turning this on makes the browser send a hash
    # of the user's email to gravatar.com and hands them the user's IP — which is in direct
    # tension with this app's whole premise. It is an informed opt-in, never a default.
    use_gravatar: Mapped[bool] = mapped_column(Boolean, default=False)
