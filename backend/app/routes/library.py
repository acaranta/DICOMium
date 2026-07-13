"""Browsing the user's own studies: list, detail, thumbnails, tags, delete."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import or_, select

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.models import Instance, Series, Study
from app.schemas.library import SeriesOut, StudyDetailOut, StudyOut, TagOut
from app.services import storage
from app.services.dicom_json import flatten_tags

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["library"])


@router.get("/studies", response_model=list[StudyOut])
async def list_studies(
    user: CurrentUser,
    db: DbSession,
    q: str | None = None,
    modality: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    query = select(Study).where(Study.user_id == user.id)

    if q:
        term = f"%{q}%"
        query = query.where(
            or_(
                Study.patient_name.ilike(term),
                Study.patient_id.ilike(term),
                Study.accession_number.ilike(term),
                Study.study_description.ilike(term),
            )
        )
    if modality:
        query = query.where(Study.modalities.like(f"%{modality}%"))
    if date_from:
        query = query.where(Study.study_date >= date_from)
    if date_to:
        query = query.where(Study.study_date <= date_to)

    query = query.order_by(Study.study_date.desc(), Study.id.desc())
    query = query.limit(min(limit, 500)).offset(offset)

    result = await db.execute(query)
    return [StudyOut.from_row(s) for s in result.scalars().all()]


@router.get("/studies/{study_uid}", response_model=StudyDetailOut)
async def get_study(study_uid: str, user: CurrentUser, db: DbSession):
    study = await _owned_study(db, user.id, study_uid)
    result = await db.execute(
        select(Series)
        .where(Series.study_id == study.id)
        .order_by(Series.series_number, Series.id)
    )
    series = [SeriesOut.from_row(s) for s in result.scalars().all()]
    return StudyDetailOut(**StudyOut.from_row(study).model_dump(), series=series)


@router.delete("/studies/{study_uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(study_uid: str, user: CurrentUser, db: DbSession) -> None:
    study = await _owned_study(db, user.id, study_uid)
    settings = get_settings()

    # Collect thumbnails before the cascade removes the rows.
    result = await db.execute(select(Series).where(Series.study_id == study.id))
    thumbs = [s.thumbnail_path for s in result.scalars().all() if s.thumbnail_path]

    dir_path = study.dir_path
    await db.delete(study)
    await db.commit()

    try:
        storage.delete_tree(settings.dicom_root, user.slug, dir_path)
    except storage.PathEscapeError:
        log.error("refusing to delete out-of-root path %s", dir_path)

    for thumb in thumbs:
        (settings.data_dir / thumb).unlink(missing_ok=True)

    log.info("deleted study %s for user %s", study_uid, user.email)


@router.get("/series/{series_uid}/thumbnail")
async def series_thumbnail(series_uid: str, user: CurrentUser, db: DbSession) -> FileResponse:
    result = await db.execute(
        select(Series).where(
            Series.user_id == user.id, Series.series_instance_uid == series_uid
        )
    )
    series = result.scalar_one_or_none()
    if series is None or not series.thumbnail_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thumbnail")

    settings = get_settings()
    path = settings.data_dir / series.thumbnail_path

    # thumbnail_path is ours, but re-check it stays inside data_dir.
    if not path.resolve().is_relative_to(settings.thumbs_dir.resolve()) or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thumbnail")

    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/instances/{sop_uid}/tags", response_model=list[TagOut])
async def instance_tags(sop_uid: str, user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Instance).where(
            Instance.user_id == user.id, Instance.sop_instance_uid == sop_uid
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such instance")
    return [TagOut(**row) for row in flatten_tags(instance.metadata_json)]


@router.get("/series/{series_uid}/instances")
async def series_instances(series_uid: str, user: CurrentUser, db: DbSession) -> list[dict]:
    """Ordered instance list. The MPR subset is flagged so the viewer can filter."""
    result = await db.execute(
        select(Series).where(
            Series.user_id == user.id, Series.series_instance_uid == series_uid
        )
    )
    series = result.scalar_one_or_none()
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such series")

    rows = await db.execute(
        select(Instance)
        .where(Instance.series_id == series.id)
        .order_by(Instance.instance_number, Instance.sop_instance_uid)
    )
    instances = list(rows.scalars().all())

    return [
        {
            "sop_instance_uid": i.sop_instance_uid,
            "instance_number": i.instance_number,
            "number_of_frames": i.number_of_frames,
            # Off-plane reference images are excluded from the MPR volume but still
            # shown in the 2D stack.
            "in_mpr_volume": (
                series.mpr_orientation is None
                or i.image_orientation_patient == series.mpr_orientation
            ),
        }
        for i in instances
    ]


async def _owned_study(db, user_id: int, study_uid: str) -> Study:
    result = await db.execute(
        select(Study).where(Study.user_id == user_id, Study.study_instance_uid == study_uid)
    )
    study = result.scalar_one_or_none()
    if study is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such study")
    return study
