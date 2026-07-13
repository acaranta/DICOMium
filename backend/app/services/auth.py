"""Password hashing and server-side sessions."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Session, User

# bcrypt silently truncates at 72 bytes; rejecting longer input is clearer than
# letting two different passwords authenticate the same account.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    if len(pw) > BCRYPT_MAX_BYTES:
        raise ValueError(f"password exceeds {BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    pw = password.encode("utf-8")
    if len(pw) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(pw, password_hash.encode("utf-8"))
    except ValueError:
        return False


async def create_session(
    db: AsyncSession,
    user: User,
    user_agent: str | None = None,
    ip: str | None = None,
) -> Session:
    settings = get_settings()
    session = Session(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=datetime.now(UTC).replace(tzinfo=None)
        + timedelta(hours=settings.session_ttl_hours),
        user_agent=(user_agent or "")[:256] or None,
        ip=ip,
    )
    db.add(session)
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    return session


async def resolve_session(db: AsyncSession, token: str | None) -> User | None:
    """Return the live user for a session token, or None."""
    if not token:
        return None

    result = await db.execute(select(Session).where(Session.token == token))
    session = result.scalar_one_or_none()
    if session is None:
        return None

    if session.expires_at < datetime.now(UTC).replace(tzinfo=None):
        await db.delete(session)
        await db.commit()
        return None

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        return None
    return user


async def destroy_session(db: AsyncSession, token: str | None) -> None:
    if not token:
        return
    await db.execute(delete(Session).where(Session.token == token))
    await db.commit()


async def sweep_expired_sessions(db: AsyncSession) -> int:
    result = await db.execute(
        delete(Session).where(Session.expires_at < datetime.now(UTC).replace(tzinfo=None))
    )
    await db.commit()
    return result.rowcount or 0
