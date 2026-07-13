"""Registration, login, logout, identity."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import func, select
from typing import Annotated

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.models import SESSION_COOKIE, User
from app.schemas.auth import AuthConfigOut, LoginRequest, RegisterRequest, UserOut
from app.services.auth import create_session, destroy_session, hash_password, verify_password
from app.services.slug import user_slug

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _user_count(db: DbSession) -> int:
    return (await db.execute(select(func.count(User.id)))).scalar_one()


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


@router.get("/config", response_model=AuthConfigOut)
async def auth_config(db: DbSession) -> AuthConfigOut:
    settings = get_settings()
    return AuthConfigOut(
        registration_enabled=settings.registration_enabled,
        has_users=await _user_count(db) > 0,
        min_password_length=settings.min_password_length,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, response: Response, db: DbSession):
    settings = get_settings()
    count = await _user_count(db)

    # A zero-user instance is always claimable, so deploying with registration off
    # cannot brick a fresh install.
    if not settings.registration_enabled and count > 0:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled")

    email = body.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered")

    taken = set((await db.execute(select(User.slug))).scalars().all())
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        slug=user_slug(email, taken),
        is_admin=count == 0,  # first user in gets the keys
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    session = await create_session(
        db, user, request.headers.get("user-agent"), request.client.host if request.client else None
    )
    _set_session_cookie(response, session.token)
    log.info("registered user %s (slug=%s, admin=%s)", user.email, user.slug, user.is_admin)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Same error for "no such user" and "wrong password" — do not leak which.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled")

    session = await create_session(
        db, user, request.headers.get("user-agent"), request.client.host if request.client else None
    )
    _set_session_cookie(response, session.token)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    webdicom_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> None:
    await destroy_session(db, webdicom_session)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
