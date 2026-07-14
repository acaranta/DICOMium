"""Auth request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.config import get_settings


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=get_settings().min_password_length, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)


class UserOut(BaseModel):
    id: int
    email: str
    slug: str
    is_admin: bool
    is_active: bool

    # Avatar settings ride along on the /me the app already makes on every load, so the header
    # needs no second request. They are optional because the admin user list builds UserOut in
    # bulk and has no use for them — populating them there would mean one preferences query per
    # row for nothing.
    avatar_style: str | None = None
    avatar_color: str | None = None
    use_gravatar: bool = False
    # SHA-256 of the lower-cased email. This is the exact value that would be handed to
    # gravatar.com, and it is only ever *used* when use_gravatar is true.
    gravatar_hash: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def with_prefs(cls, user, prefs, gravatar_hash: str) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            slug=user.slug,
            is_admin=user.is_admin,
            is_active=user.is_active,
            avatar_style=prefs.avatar_style,
            avatar_color=prefs.avatar_color,
            use_gravatar=prefs.use_gravatar,
            gravatar_hash=gravatar_hash,
        )


class AuthConfigOut(BaseModel):
    registration_enabled: bool
    has_users: bool
    min_password_length: int
