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

    model_config = {"from_attributes": True}


class AuthConfigOut(BaseModel):
    registration_enabled: bool
    has_users: bool
    min_password_length: int
