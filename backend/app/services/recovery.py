"""One-time recovery codes: the way back in when the phone and the passkey are both gone.

Codes are hashed with bcrypt exactly like passwords, and burned on first use. They are
shown to the user exactly once, at generation — after that the server genuinely cannot
recover them, which is the point.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RECOVERY_CODE_COUNT, RecoveryCode, User
from app.services.auth import hash_password, verify_password

log = logging.getLogger(__name__)

# Crockford-ish base32: no I, L, O, U — so a code read off a screen and typed by hand
# cannot be ruined by 1/I or 0/O confusion.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
GROUP_LEN = 5
GROUPS = 2


def _generate_code() -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(GROUP_LEN * GROUPS))
    return "-".join(body[i : i + GROUP_LEN] for i in range(0, len(body), GROUP_LEN))


def normalize(code: str) -> str:
    """Accept what a human actually types: lowercase, spaces, missing dashes."""
    return "".join(c for c in (code or "").upper() if c in ALPHABET)


async def generate(db: AsyncSession, user: User) -> list[str]:
    """Replace the user's recovery codes and return the new ones in plaintext, once."""
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))

    codes = [_generate_code() for _ in range(RECOVERY_CODE_COUNT)]
    for code in codes:
        # bcrypt over the normalized form, so verification does not depend on how the
        # user retyped the dashes.
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_password(normalize(code))))

    await db.commit()
    log.info("issued %d recovery codes for %s", len(codes), user.email)
    return codes


async def consume(db: AsyncSession, user: User, code: str) -> bool:
    """Burn a recovery code. Returns False if it is unknown or already spent."""
    candidate = normalize(code)
    if not candidate:
        return False

    result = await db.execute(
        select(RecoveryCode).where(
            RecoveryCode.user_id == user.id,
            RecoveryCode.used_at.is_(None),
        )
    )
    # bcrypt is deliberately slow and the hashes are unindexable, so we must compare
    # against each unused code. With a cap of 10 that is fine.
    for row in result.scalars().all():
        if verify_password(candidate, row.code_hash):
            row.used_at = datetime.now(UTC).replace(tzinfo=None)
            await db.commit()
            log.info("recovery code consumed by %s", user.email)
            return True

    return False


async def remaining(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(
        select(RecoveryCode).where(
            RecoveryCode.user_id == user_id,
            RecoveryCode.used_at.is_(None),
        )
    )
    return len(result.scalars().all())
