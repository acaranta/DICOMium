"""Password hashing, server-side sessions, and the half-authenticated pending state."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    MAX_MFA_ATTEMPTS,
    PENDING_LOGIN_TTL_MINUTES,
    PendingLogin,
    Session,
    TotpCredential,
    User,
)

log = logging.getLogger(__name__)

# bcrypt silently truncates at 72 bytes; rejecting longer input is clearer than
# letting two different passwords authenticate the same account.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")
    if len(pw) > BCRYPT_MAX_BYTES:
        raise ValueError(f"password exceeds {BCRYPT_MAX_BYTES} bytes")
    rounds = get_settings().bcrypt_rounds
    return bcrypt.hashpw(pw, bcrypt.gensalt(rounds=rounds)).decode("utf-8")


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
    now = datetime.now(UTC).replace(tzinfo=None)
    result = await db.execute(delete(Session).where(Session.expires_at < now))
    await db.execute(delete(PendingLogin).where(PendingLogin.expires_at < now))
    await db.commit()
    return result.rowcount or 0


# ---- MFA: the half-authenticated state ---------------------------------------
#
# After a correct password, but before a correct second factor, the user is in limbo. That
# limbo gets its OWN cookie and its own table — it is deliberately NOT a flag on the
# session.
#
# The reason is fail-closed vs fail-open. With a flag, every protected route would have to
# remember to check it, and the one that forgets silently serves patient data to a
# half-authenticated caller. With a separate cookie, no session row exists at all until MFA
# passes, so a forgotten check cannot leak anything: there is simply nothing to resolve.


async def totp_enabled(db: AsyncSession, user_id: int) -> bool:
    """True only for a CONFIRMED enrolment.

    An unconfirmed row (the user scanned the QR but never entered a code) must never gate a
    login, or an abandoned setup would lock them out of their own account.
    """
    result = await db.execute(
        select(TotpCredential).where(
            TotpCredential.user_id == user_id,
            TotpCredential.confirmed_at.is_not(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def create_pending_login(db: AsyncSession, user: User) -> PendingLogin:
    # One pending login per user: starting a new sign-in invalidates a stale one.
    await db.execute(delete(PendingLogin).where(PendingLogin.user_id == user.id))

    pending = PendingLogin(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=datetime.now(UTC).replace(tzinfo=None)
        + timedelta(minutes=PENDING_LOGIN_TTL_MINUTES),
    )
    db.add(pending)
    await db.commit()
    return pending


async def resolve_pending_login(db: AsyncSession, token: str | None) -> PendingLogin | None:
    if not token:
        return None

    result = await db.execute(select(PendingLogin).where(PendingLogin.token == token))
    pending = result.scalar_one_or_none()
    if pending is None:
        return None

    if pending.expires_at < datetime.now(UTC).replace(tzinfo=None):
        await db.delete(pending)
        await db.commit()
        return None

    return pending


async def record_failed_mfa(db: AsyncSession, pending: PendingLogin) -> int:
    """Count a wrong code. Past the cap the pending login is destroyed.

    Without this, a 6-digit code is a million guesses against an endpoint that will happily
    answer all of them.
    """
    pending.attempts += 1
    attempts = pending.attempts

    if attempts >= MAX_MFA_ATTEMPTS:
        log.warning("too many failed MFA attempts for user %s — pending login destroyed", pending.user_id)
        await db.delete(pending)

    await db.commit()
    return attempts


async def destroy_pending_login(db: AsyncSession, token: str | None) -> None:
    if not token:
        return
    await db.execute(delete(PendingLogin).where(PendingLogin.token == token))
    await db.commit()
