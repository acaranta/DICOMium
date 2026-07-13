"""Emergency CLI. Run inside the container:

    docker compose exec webdicom python -m app.cli reset-mfa you@example.com
    docker compose exec webdicom python -m app.cli list-users

Recovery codes are the normal way back in. This exists for the case they do not cover: a
sole administrator who loses their authenticator AND their recovery codes, and so has
nobody left who can help them. Without it, the instance would simply be dead.

It requires shell access to the container, which is a strictly higher bar than any
password.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete, select

from app.config import get_settings
from app.db.engine import dispose_engine, get_sessionmaker
from app.logging_conf import setup_logging
from app.models import Passkey, RecoveryCode, TotpCredential, User


async def reset_mfa(email: str) -> int:
    async with get_sessionmaker()() as db:
        result = await db.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"No such user: {email}", file=sys.stderr)
            return 1

        await db.execute(delete(TotpCredential).where(TotpCredential.user_id == user.id))
        await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
        passkeys = await db.execute(delete(Passkey).where(Passkey.user_id == user.id))
        await db.commit()

        print(
            f"Cleared MFA for {user.email}: TOTP removed, recovery codes revoked, "
            f"{passkeys.rowcount or 0} passkey(s) deleted."
        )
        print("They can now sign in with their password alone. Tell them to re-enrol.")
        return 0


async def list_users() -> int:
    async with get_sessionmaker()() as db:
        users = (await db.execute(select(User).order_by(User.id))).scalars().all()
        for user in users:
            totp = (
                await db.execute(
                    select(TotpCredential).where(
                        TotpCredential.user_id == user.id,
                        TotpCredential.confirmed_at.is_not(None),
                    )
                )
            ).scalar_one_or_none()
            keys = (
                await db.execute(select(Passkey).where(Passkey.user_id == user.id))
            ).scalars().all()

            flags = []
            if user.is_admin:
                flags.append("admin")
            if not user.is_active:
                flags.append("disabled")
            if totp:
                flags.append("totp")
            if keys:
                flags.append(f"{len(keys)} passkey(s)")

            print(f"{user.id:>3}  {user.email:<32} {', '.join(flags) or '-'}")
        return 0


def main() -> int:
    setup_logging(get_settings().log_level)

    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    command = sys.argv[1]

    if command == "reset-mfa":
        if len(sys.argv) != 3:
            print("usage: python -m app.cli reset-mfa <email>", file=sys.stderr)
            return 2
        return asyncio.run(_run(reset_mfa(sys.argv[2])))

    if command == "list-users":
        return asyncio.run(_run(list_users()))

    print(f"Unknown command: {command}", file=sys.stderr)
    print(__doc__, file=sys.stderr)
    return 2


async def _run(coro) -> int:
    try:
        return await coro
    finally:
        await dispose_engine()


if __name__ == "__main__":
    raise SystemExit(main())
