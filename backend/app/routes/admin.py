"""Admin: user management and instance-wide stats."""

from __future__ import annotations

import logging
import shutil

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.errors import AppError
from app.config import get_settings
from app.dependencies import AdminUser, DbSession
from app.models import Instance, Study, User
from app.schemas.auth import UserOut
from app.services import storage

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


class StatsOut(BaseModel):
    users: int
    studies: int
    instances: int
    bytes_stored: int


@router.get("/users", response_model=list[UserOut])
async def list_users(_admin: AdminUser, db: DbSession):
    result = await db.execute(select(User).order_by(User.id))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(user_id: int, body: UserPatch, admin: AdminUser, db: DbSession):
    user = await db.get(User, user_id)
    if user is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "admin.user_not_found", "No such user")

    # Do not let an admin lock themselves out, or strip the last admin.
    if user.id == admin.id and (body.is_active is False or body.is_admin is False):
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "admin.cannot_demote_self",
            "You cannot demote or disable yourself",
        )

    if body.is_admin is False:
        admins = (
            await db.execute(select(func.count(User.id)).where(User.is_admin.is_(True)))
        ).scalar_one()
        if admins <= 1:
            raise AppError(
                status.HTTP_400_BAD_REQUEST,
                "admin.last_admin",
                "The last admin cannot be demoted",
            )

    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin

    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, admin: AdminUser, db: DbSession) -> None:
    user = await db.get(User, user_id)
    if user is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "admin.user_not_found", "No such user")
    if user.id == admin.id:
        raise AppError(
            status.HTTP_400_BAD_REQUEST, "admin.cannot_delete_self", "You cannot delete yourself"
        )

    settings = get_settings()
    slug = user.slug

    await db.delete(user)  # cascades to sessions, studies, series, instances, jobs
    await db.commit()

    root = storage.user_root(settings.dicom_root, slug)
    shutil.rmtree(root, ignore_errors=True)
    log.info("deleted user %s and their entire store at %s", user.email, root)


@router.get("/stats", response_model=StatsOut)
async def stats(_admin: AdminUser, db: DbSession) -> StatsOut:
    users = (await db.execute(select(func.count(User.id)))).scalar_one()
    studies = (await db.execute(select(func.count(Study.id)))).scalar_one()
    instances = (await db.execute(select(func.count(Instance.id)))).scalar_one()
    total_bytes = (await db.execute(select(func.coalesce(func.sum(Instance.file_size), 0)))).scalar_one()
    return StatsOut(users=users, studies=studies, instances=instances, bytes_stored=total_bytes)
