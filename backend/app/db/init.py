"""Schema creation, directory bootstrap, and the optional admin from env."""

from __future__ import annotations

import logging

from sqlalchemy import func, select

from app.config import get_settings
from app.db.base import Base
from app.db.engine import get_engine, get_sessionmaker
from app.models import User  # noqa: F401 - registers every table on Base.metadata
from app.services.auth import hash_password, sweep_expired_sessions
from app.services.slug import user_slug
from app.services.webauthn import sweep_challenges

log = logging.getLogger(__name__)


async def init_db() -> None:
    settings = get_settings()

    for directory in (settings.data_dir, settings.thumbs_dir, settings.dicom_root, settings.staging_root):
        directory.mkdir(parents=True, exist_ok=True)

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with get_sessionmaker()() as db:
        removed = await sweep_expired_sessions(db)
        if removed:
            log.info("swept %d expired session(s)", removed)

        stale = await sweep_challenges(db)
        if stale:
            log.info("swept %d expired WebAuthn challenge(s)", stale)

        if settings.admin_email and settings.admin_password:
            await _bootstrap_admin(db, settings.admin_email, settings.admin_password)

    log.info("database ready at %s", settings.db_path)


async def _bootstrap_admin(db, email: str, password: str) -> None:
    email = email.lower().strip()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        return

    taken = set((await db.execute(select(User.slug))).scalars().all())
    count = (await db.execute(select(func.count(User.id)))).scalar_one()

    db.add(
        User(
            email=email,
            password_hash=hash_password(password),
            slug=user_slug(email, taken),
            is_admin=True,
            is_active=True,
        )
    )
    await db.commit()
    log.info("bootstrapped admin %s (from env)%s", email, "" if count else " as the first user")
