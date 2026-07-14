"""FastAPI dependencies: the current user, and the admin gate."""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.db.engine import get_db
from app.models import SESSION_COOKIE, User
from app.services.auth import resolve_session

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    dicomium_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> User:
    user = await resolve_session(db, dicomium_session)
    if user is None:
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "auth.not_authenticated",
            "Not authenticated",
        )
    return user


async def get_optional_user(
    db: DbSession,
    dicomium_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> User | None:
    return await resolve_session(db, dicomium_session)


async def get_admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise AppError(
            status.HTTP_403_FORBIDDEN,
            "auth.admin_required",
            "Administrator access required",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
