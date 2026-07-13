"""Multi-factor authentication: passkeys, TOTP, recovery codes, and the transient
state that supports them.

Every field here lives in its OWN table. Nothing is added to `users`.

That is deliberate. The database already holds real imported exams, and this project has
no Alembic: `Base.metadata.create_all` creates new *tables* but never adds *columns* to
existing ones. A `totp_secret` column on `users` would silently fail to appear and then
blow up at runtime. Separate tables are created cleanly on the next boot, with no
migration — and they model the domain better anyway, since MFA is optional and a user may
hold many passkeys.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# The half-authenticated cookie, set after a correct password when TOTP is enabled.
# Deliberately NOT the session cookie: until MFA passes, no session exists at all, so a
# route that forgets to check cannot leak anything.
MFA_COOKIE = "dicomium_mfa"

PENDING_LOGIN_TTL_MINUTES = 5
CHALLENGE_TTL_MINUTES = 5

# A 6-digit code has a million possibilities; without a cap it is trivially brute-forced.
MAX_MFA_ATTEMPTS = 5

RECOVERY_CODE_COUNT = 10


class Passkey(Base, TimestampMixin):
    """A registered WebAuthn credential."""

    __tablename__ = "passkeys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # The raw credential ID. Unique across all users: a credential belongs to exactly one.
    credential_id: Mapped[bytes] = mapped_column(LargeBinary(1024), unique=True, index=True)
    public_key: Mapped[bytes] = mapped_column(LargeBinary(1024))

    # Clone detection. Many authenticators (notably iCloud Keychain) always report 0.
    sign_count: Mapped[int] = mapped_column(Integer, default=0)

    transports: Mapped[str | None] = mapped_column(String(128), default=None)  # csv
    aaguid: Mapped[str | None] = mapped_column(String(64), default=None)
    # True when the credential is synced to a cloud keychain, so the user knows it will
    # survive losing the device.
    backed_up: Mapped[bool] = mapped_column(Boolean, default=False)

    nickname: Mapped[str] = mapped_column(String(64), default="Passkey")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class TotpCredential(Base, TimestampMixin):
    """One authenticator-app enrolment per user."""

    __tablename__ = "totp_credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )

    # Fernet-encrypted. A stolen index.db must not hand over everyone's second factor.
    secret_encrypted: Mapped[bytes] = mapped_column(LargeBinary(512))

    # NULL until the user proves they scanned the QR by entering a live code. An
    # unconfirmed enrolment must never gate a login, or a half-finished setup would lock
    # the user out.
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    # Replay guard: the last accepted 30-second counter. A code shoulder-surfed inside its
    # own window cannot be reused.
    last_counter: Mapped[int] = mapped_column(Integer, default=0)


class RecoveryCode(Base, TimestampMixin):
    """A single-use code for when the phone and the passkey are both gone."""

    __tablename__ = "recovery_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))  # bcrypt
    used_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class PendingLogin(Base, TimestampMixin):
    """A password has been accepted, but the second factor has not."""

    __tablename__ = "pending_logins"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class ChallengePurpose(str, enum.Enum):
    REGISTER = "register"
    AUTHENTICATE = "authenticate"


class WebAuthnChallenge(Base):
    """A one-shot WebAuthn challenge.

    Kept server-side rather than round-tripped through the client, so the client cannot
    choose its own challenge. user_id is NULL for passwordless sign-in, where we do not
    yet know who is knocking.
    """

    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge: Mapped[bytes] = mapped_column(LargeBinary(256), index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True
    )
    purpose: Mapped[str] = mapped_column(String(16))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
