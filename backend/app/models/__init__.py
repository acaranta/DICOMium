"""SQLAlchemy models.

Imported here so ``Base.metadata`` sees every table before ``create_all``.
"""

from app.models.instance import Instance
from app.models.mfa import (
    CHALLENGE_TTL_MINUTES,
    MAX_MFA_ATTEMPTS,
    MFA_COOKIE,
    PENDING_LOGIN_TTL_MINUTES,
    RECOVERY_CODE_COUNT,
    ChallengePurpose,
    Passkey,
    PendingLogin,
    RecoveryCode,
    TotpCredential,
    WebAuthnChallenge,
)
from app.models.preferences import (
    AVATAR_COLORS,
    AVATAR_STYLES,
    DEFAULT_COLOR,
    DEFAULT_STYLE,
    UserPreference,
)
from app.models.series import Series
from app.models.session import SESSION_COOKIE, Session
from app.models.study import Study
from app.models.upload_job import JobStatus, UploadJob
from app.models.user import User

__all__ = [
    "AVATAR_COLORS",
    "AVATAR_STYLES",
    "CHALLENGE_TTL_MINUTES",
    "DEFAULT_COLOR",
    "DEFAULT_STYLE",
    "MAX_MFA_ATTEMPTS",
    "MFA_COOKIE",
    "PENDING_LOGIN_TTL_MINUTES",
    "RECOVERY_CODE_COUNT",
    "SESSION_COOKIE",
    "ChallengePurpose",
    "Instance",
    "JobStatus",
    "Passkey",
    "PendingLogin",
    "RecoveryCode",
    "Series",
    "Session",
    "Study",
    "TotpCredential",
    "UploadJob",
    "User",
    "UserPreference",
    "WebAuthnChallenge",
]
