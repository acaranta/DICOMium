"""Avatar defaults and the Gravatar hash."""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AVATAR_COLORS, AVATAR_STYLES, User, UserPreference


def normalize_email(email: str) -> str:
    return email.strip().lower()


def gravatar_hash(email: str) -> str:
    """The identifier Gravatar expects.

    SHA-256 of the trimmed, lower-cased address — Gravatar's current API. (MD5 still works but
    is the legacy form.) Computed server-side so the frontend needs no crypto call, and so the
    exact bytes we would hand to a third party are visible in one place.
    """
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


def defaults_for(email: str) -> tuple[str, str]:
    """A stable (style, colour) for a user who has never chosen one.

    Derived from the email, so an untouched account still gets a distinct avatar that does not
    change between sessions or between the header and the account page.
    """
    digest = hashlib.sha256(normalize_email(email).encode("utf-8")).digest()
    color = AVATAR_COLORS[digest[0] % len(AVATAR_COLORS)]
    # Everyone starts on "solid": it is the most legible, and the alternatives are an
    # opt-in flourish rather than a lottery.
    return AVATAR_STYLES[0], color


async def preferences_for(db: AsyncSession, user: User) -> UserPreference:
    """The user's preferences, materialising defaults on first access.

    Lazily created rather than backfilled, so accounts that already exist need no migration and
    a user who never visits the profile page costs nothing.
    """
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is not None:
        return prefs

    style, color = defaults_for(user.email)
    prefs = UserPreference(
        user_id=user.id,
        avatar_style=style,
        avatar_color=color,
        use_gravatar=False,
    )
    db.add(prefs)
    await db.commit()
    await db.refresh(prefs)
    return prefs
