"""Account security schemas: passkeys, TOTP, recovery codes."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import AVATAR_COLORS, AVATAR_STYLES, LANGUAGES, Passkey


class LoginResult(BaseModel):
    """The answer to POST /login.

    Either the user is in (`user` is set), or a second factor is owed (`mfa_required`).
    Never both.
    """

    mfa_required: bool = False
    user: "UserOut | None" = None
    # Which methods the MFA step will accept, so the UI can offer the right inputs.
    methods: list[str] = Field(default_factory=list)


class MfaVerifyRequest(BaseModel):
    # A 6-digit TOTP code or a recovery code. One field: the server can tell them apart,
    # and making the user pick the right box first is needless friction.
    code: str = Field(min_length=1, max_length=64)


class PasskeyOut(BaseModel):
    id: int
    nickname: str
    backed_up: bool
    transports: list[str]
    created_at: datetime
    last_used_at: datetime | None

    @classmethod
    def from_row(cls, row: Passkey) -> "PasskeyOut":
        return cls(
            id=row.id,
            nickname=row.nickname,
            backed_up=row.backed_up,
            transports=[t for t in (row.transports or "").split(",") if t],
            created_at=row.created_at,
            last_used_at=row.last_used_at,
        )


class PasskeyRegisterRequest(BaseModel):
    credential: dict
    nickname: str = Field(default="Passkey", max_length=64)


class PasskeyRenameRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=64)


class PasskeyLoginRequest(BaseModel):
    credential: dict


class TotpBeginOut(BaseModel):
    secret: str  # for manual entry when a QR cannot be scanned
    uri: str
    qr_data_url: str


class TotpConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class SecurityStatusOut(BaseModel):
    """Everything the /account page needs in one call."""

    totp_enabled: bool
    passkeys: list[PasskeyOut]
    recovery_codes_remaining: int
    # False when served over plain HTTP on a non-localhost origin, where the browser will
    # refuse WebAuthn no matter what we do. The UI explains rather than failing.
    passkeys_supported: bool
    passkeys_unsupported_reason: str = ""


class RecoveryCodesOut(BaseModel):
    """Shown exactly once. The server keeps only bcrypt hashes."""

    codes: list[str]


class PasswordConfirmRequest(BaseModel):
    """Re-authentication for destructive security changes.

    Without this, a stolen session could silently strip MFA off the account — which would
    make MFA pointless the moment a session leaks.
    """

    password: str = Field(max_length=72)


class PreferencesOut(BaseModel):
    avatar_style: str
    avatar_color: str
    use_gravatar: bool
    gravatar_hash: str
    # NULL means "follow the browser" — a real state, not a missing one.
    language: str | None
    # The valid sets, so the UI renders exactly what the server will accept rather than
    # hardcoding a list that can drift out of sync with the backend's validation.
    available_styles: list[str]
    available_colors: list[str]
    available_languages: list[str]


class PreferencesPatch(BaseModel):
    """Every field optional — a PATCH may change one thing.

    Style, colour and language are validated against the known sets, so an unknown value cannot
    be stored and then fail to render later.

    `language` uses a sentinel rather than `None` for "unset": None already means "field not
    present in this PATCH", so there would otherwise be no way to express "clear my language and
    go back to following the browser".
    """

    avatar_style: str | None = None
    avatar_color: str | None = None
    use_gravatar: bool | None = None
    language: str | Literal["auto"] | None = None

    @field_validator("avatar_style")
    @classmethod
    def _known_style(cls, value: str | None) -> str | None:
        if value is not None and value not in AVATAR_STYLES:
            raise ValueError(f"unknown avatar style: {value!r}")
        return value

    @field_validator("avatar_color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is not None and value not in AVATAR_COLORS:
            raise ValueError(f"unknown avatar colour: {value!r}")
        return value

    @field_validator("language")
    @classmethod
    def _known_language(cls, value: str | None) -> str | None:
        if value is not None and value != "auto" and value not in LANGUAGES:
            raise ValueError(f"unsupported language: {value!r}")
        return value


from app.schemas.auth import UserOut  # noqa: E402  (circular: LoginResult references it)

LoginResult.model_rebuild()
