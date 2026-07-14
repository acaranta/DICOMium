"""WADO-RS: retrieve metadata, frames, and whole Part 10 instances.

The series metadata route is the one Cornerstone actually calls before loading a stack,
and it is a pure DB read: the stored per-instance DICOM JSON blobs are concatenated into
a JSON array without ever being parsed or re-serialized.

Instance ordering here IS the slice order the viewer displays, so it must be stable:
(instance_number, sop_instance_uid).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import anyio
from fastapi import APIRouter, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.errors import AppError
from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.models import Instance, Series, Study
from app.services import frames as frames_svc
from app.services import multipart, storage
from app.services.dicom_json import PHOTOMETRIC, PLANAR_CONFIG

log = logging.getLogger(__name__)
router = APIRouter(prefix="/dicomweb", tags=["dicomweb"])

DICOM_JSON = "application/dicom+json"
APPLICATION_DICOM = "application/dicom"


async def _owned_study(db, user_id: int, study_uid: str) -> Study:
    result = await db.execute(
        select(Study).where(Study.user_id == user_id, Study.study_instance_uid == study_uid)
    )
    study = result.scalar_one_or_none()
    if study is None:
        raise AppError(status.HTTP_404_NOT_FOUND, "library.study_not_found", "No such study")
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
        raise AppError(status.HTTP_404_NOT_FOUND, "library.series_not_found", "No such series")
    return series


async def _owned_instance(db, user_id: int, series: Series, sop_uid: str) -> Instance:
    result = await db.execute(
        select(Instance).where(
            Instance.user_id == user_id,
            Instance.series_id == series.id,
            Instance.sop_instance_uid == sop_uid,
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise AppError(
            status.HTTP_404_NOT_FOUND, "library.instance_not_found", "No such instance"
        )
    return instance


def _instance_file(instance: Instance, user_slug: str) -> Path:
    """Resolve an instance's file, re-checking containment even though the path came
    from our own DB. Defence in depth: a corrupted row must not become an arbitrary read."""
    settings = get_settings()
    try:
        path = storage.ensure_within(settings.dicom_root, user_slug, Path(instance.file_path))
    except storage.PathEscapeError:
        log.error("instance %s has an out-of-root path: %s", instance.id, instance.file_path)
        raise AppError(
            status.HTTP_404_NOT_FOUND, "library.instance_not_found", "No such instance"
        ) from None

    if not path.is_file():
        raise AppError(
            status.HTTP_404_NOT_FOUND, "library.file_missing", "The stored file is missing"
        )
    return path


def _metadata_array(rows: list[str]) -> Response:
    """Concatenate stored JSON blobs into an array without re-serializing them."""
    body = b"[" + b",".join(r.encode("utf-8") for r in rows) + b"]"
    return Response(content=body, media_type=DICOM_JSON)


@router.get("/studies/{study_uid}/metadata")
async def study_metadata(study_uid: str, user: CurrentUser, db: DbSession) -> Response:
    study = await _owned_study(db, user.id, study_uid)
    result = await db.execute(
        select(Instance.metadata_json)
        .join(Series, Instance.series_id == Series.id)
        .where(Series.study_id == study.id)
        .order_by(Series.series_number, Instance.instance_number, Instance.sop_instance_uid)
    )
    return _metadata_array(list(result.scalars().all()))


@router.get("/studies/{study_uid}/series/{series_uid}/metadata")
async def series_metadata(
    study_uid: str, series_uid: str, user: CurrentUser, db: DbSession
) -> Response:
    """The route Cornerstone calls to build its imageIds. Ordering is the slice order."""
    study = await _owned_study(db, user.id, study_uid)
    series = await _owned_series(db, user.id, study, series_uid)

    result = await db.execute(
        select(Instance.metadata_json)
        .where(Instance.series_id == series.id)
        .order_by(Instance.instance_number, Instance.sop_instance_uid)
    )
    return _metadata_array(list(result.scalars().all()))


@router.get("/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}/metadata")
async def instance_metadata(
    study_uid: str, series_uid: str, sop_uid: str, user: CurrentUser, db: DbSession
) -> Response:
    study = await _owned_study(db, user.id, study_uid)
    series = await _owned_series(db, user.id, study, series_uid)
    instance = await _owned_instance(db, user.id, series, sop_uid)
    return _metadata_array([instance.metadata_json])


@router.get("/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}/frames/{frame_list}")
async def retrieve_frames(
    study_uid: str,
    series_uid: str,
    sop_uid: str,
    frame_list: str,
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    """multipart/related frame retrieval. Byte-exactness matters here — see multipart.py."""
    study = await _owned_study(db, user.id, study_uid)
    series = await _owned_series(db, user.id, study, series_uid)
    instance = await _owned_instance(db, user.id, series, sop_uid)
    path = _instance_file(instance, user.slug)

    try:
        numbers = [int(n) for n in frame_list.split(",") if n.strip()]
    except ValueError:
        raise AppError(
            status.HTTP_400_BAD_REQUEST, "frame.malformed_list", "Malformed frame list"
        ) from None
    if not numbers:
        raise AppError(status.HTTP_400_BAD_REQUEST, "frame.none_requested", "No frames requested")

    settings = get_settings()
    try:
        data = await anyio.to_thread.run_sync(
            frames_svc.get_frames, path, numbers, settings.dicomweb_transcode
        )
    except frames_svc.FrameError as exc:
        raise AppError.of(status.HTTP_400_BAD_REQUEST, exc) from exc

    first = data[0]
    boundary = multipart.make_boundary()
    base = str(request.base_url).rstrip("/") + "/dicomweb"
    locations = [
        f"{base}/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}/frames/{n}"
        for n in numbers
    ]

    body = multipart.build(
        parts=[d.payload for d in data],
        boundary=boundary,
        media_type=first.media_type,
        transfer_syntax=first.transfer_syntax,
        content_locations=locations,
    )
    return Response(
        content=body,
        media_type=multipart.content_type_header(
            boundary, first.media_type, first.transfer_syntax
        ),
    )


@router.get("/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}")
async def retrieve_instance(
    study_uid: str, series_uid: str, sop_uid: str, user: CurrentUser, db: DbSession
) -> FileResponse:
    """The whole Part 10 file, for downloads and external DICOMweb clients."""
    study = await _owned_study(db, user.id, study_uid)
    series = await _owned_series(db, user.id, study, series_uid)
    instance = await _owned_instance(db, user.id, series, sop_uid)
    path = _instance_file(instance, user.slug)

    return FileResponse(
        path,
        media_type=APPLICATION_DICOM,
        filename=f"{sop_uid}.dcm",
    )


def patch_photometric(metadata_json: str, instance: Instance, transcoded: bool) -> str:
    """When we transcode, the stored photometric interpretation would lie to the client.

    Kept here (rather than mutating stored JSON) so the on-disk truth is never rewritten.
    """
    if not transcoded:
        return metadata_json

    effective = frames_svc.effective_photometric(instance.photometric_interpretation, True)
    if effective == instance.photometric_interpretation:
        return metadata_json

    data = json.loads(metadata_json)
    data[PHOTOMETRIC] = {"vr": "CS", "Value": [effective]}
    data[PLANAR_CONFIG] = {"vr": "US", "Value": [0]}
    return json.dumps(data, separators=(",", ":"))
