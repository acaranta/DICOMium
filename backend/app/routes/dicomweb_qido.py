"""QIDO-RS: search for studies, series and instances.

Every query is scoped to the session's user. A UID belonging to someone else returns
404, never 403 — a 403 would confirm the study exists.

An empty result is 204 No Content with an empty body, not "[]". That is what the
standard requires and what real DICOMweb clients expect.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models import Instance, Series, Study
from app.services import dicom_json

router = APIRouter(prefix="/dicomweb", tags=["dicomweb"])

DICOM_JSON = "application/dicom+json"


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/dicomweb"


def _respond(items: list[dict]) -> Response:
    if not items:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    import json

    return Response(content=json.dumps(items), media_type=DICOM_JSON)


async def _owned_study(db, user_id: int, study_uid: str) -> Study:
    result = await db.execute(
        select(Study).where(Study.user_id == user_id, Study.study_instance_uid == study_uid)
    )
    study = result.scalar_one_or_none()
    if study is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such study")
    return study


async def _owned_series(db, user_id: int, study: Study, series_uid: str) -> Series:
    result = await db.execute(
        select(Series).where(
            Series.user_id == user_id,
            Series.study_id == study.id,
            Series.series_instance_uid == series_uid,
        )
    )
    series = result.scalar_one_or_none()
    if series is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such series")
    return series


@router.get("/studies")
async def search_studies(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    limit: int = 100,
    offset: int = 0,
    PatientID: str | None = None,  # noqa: N803 - DICOM attribute names are the API
    PatientName: str | None = None,  # noqa: N803
    StudyDate: str | None = None,  # noqa: N803
    AccessionNumber: str | None = None,  # noqa: N803
    ModalitiesInStudy: str | None = None,  # noqa: N803
) -> Response:
    query = select(Study).where(Study.user_id == user.id)

    # QIDO wildcards are '*' and '?'; SQL wants '%' and '_'.
    def like(value: str) -> str:
        return value.replace("*", "%").replace("?", "_")

    if PatientID:
        query = query.where(Study.patient_id.like(like(PatientID)))
    if PatientName:
        query = query.where(Study.patient_name.like(like(PatientName)))
    if StudyDate:
        query = query.where(Study.study_date.like(like(StudyDate)))
    if AccessionNumber:
        query = query.where(Study.accession_number.like(like(AccessionNumber)))
    if ModalitiesInStudy:
        query = query.where(Study.modalities.like(f"%{ModalitiesInStudy}%"))

    query = query.order_by(Study.study_date.desc()).limit(min(limit, 500)).offset(offset)
    studies = (await db.execute(query)).scalars().all()

    base = _base_url(request)
    return _respond([dicom_json.study_json(s, base) for s in studies])


@router.get("/studies/{study_uid}/series")
async def search_series(
    study_uid: str, request: Request, user: CurrentUser, db: DbSession
) -> Response:
    study = await _owned_study(db, user.id, study_uid)
    result = await db.execute(
        select(Series).where(Series.study_id == study.id).order_by(Series.series_number)
    )
    base = _base_url(request)
    return _respond(
        [dicom_json.series_json(s, study_uid, base) for s in result.scalars().all()]
    )


@router.get("/studies/{study_uid}/series/{series_uid}/instances")
async def search_instances(
    study_uid: str,
    series_uid: str,
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    study = await _owned_study(db, user.id, study_uid)
    series = await _owned_series(db, user.id, study, series_uid)

    result = await db.execute(
        select(Instance)
        .where(Instance.series_id == series.id)
        .order_by(Instance.instance_number, Instance.sop_instance_uid)
    )
    base = _base_url(request)
    return _respond(
        [
            dicom_json.instance_json(i, study_uid, series_uid, base)
            for i in result.scalars().all()
        ]
    )
