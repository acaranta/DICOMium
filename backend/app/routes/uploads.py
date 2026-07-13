"""Upload intake and job status.

The POST streams every part to staging, schedules the ingest task, and returns 202
immediately. A 600 MB DVD takes minutes to import; the browser must not hold the
connection open for it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.config import get_settings
from app.db.engine import get_sessionmaker
from app.dependencies import CurrentUser, DbSession
from app.models import JobStatus, UploadJob
from app.schemas.upload import UploadJobOut
from app.services import jobs
from app.services.ingest import run_ingest
from app.services.slug import slugify

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/uploads", tags=["uploads"])

CHUNK = 1 << 20  # 1 MiB


@router.post("", response_model=UploadJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_upload(user: CurrentUser, db: DbSession, files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files were uploaded")

    settings = get_settings()
    job_id = str(uuid.uuid4())
    incoming = settings.staging_root / job_id / "incoming"
    incoming.mkdir(parents=True, exist_ok=True)

    max_bytes = settings.max_upload_mb * 1024 * 1024
    total = 0
    names: list[str] = []

    for index, upload in enumerate(files):
        # The client filename is untrusted: keep the basename, slug it, and prefix the
        # index so two parts named the same cannot clobber each other.
        raw = Path(upload.filename or f"upload-{index}").name
        safe = slugify(raw, maxlen=96)
        target = incoming / f"{index:04d}_{safe}"
        names.append(raw)

        with target.open("wb") as fh:
            while chunk := await upload.read(CHUNK):
                total += len(chunk)
                if total > max_bytes:
                    fh.close()
                    _cleanup(settings.staging_root / job_id)
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"Upload exceeds the {settings.max_upload_mb} MB limit",
                    )
                fh.write(chunk)
        await upload.close()

    job = UploadJob(
        id=job_id,
        user_id=user.id,
        status=JobStatus.PENDING.value,
        message="Queued",
        source_names=json.dumps(names),
        bytes_received=total,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    task = asyncio.create_task(run_ingest(job_id, user.id, get_sessionmaker(), settings))
    jobs.register(job_id, task)

    log.info("upload %s queued: %d file(s), %.1f MB", job_id, len(files), total / 1e6)
    return UploadJobOut.from_row(job)


@router.get("", response_model=list[UploadJobOut])
async def list_uploads(user: CurrentUser, db: DbSession, limit: int = 20):
    result = await db.execute(
        select(UploadJob)
        .where(UploadJob.user_id == user.id)
        .order_by(UploadJob.created_at.desc())
        .limit(min(limit, 100))
    )
    return [UploadJobOut.from_row(row) for row in result.scalars().all()]


@router.get("/{job_id}", response_model=UploadJobOut)
async def get_upload(job_id: str, user: CurrentUser, db: DbSession):
    job = await _owned(db, job_id, user.id)
    return UploadJobOut.from_row(job)


@router.post("/{job_id}/cancel", response_model=UploadJobOut)
async def cancel_upload(job_id: str, user: CurrentUser, db: DbSession):
    job = await _owned(db, job_id, user.id)
    if not jobs.request_cancel(job_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "That job is no longer running")
    await db.refresh(job)
    return UploadJobOut.from_row(job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(job_id: str, user: CurrentUser, db: DbSession) -> None:
    job = await _owned(db, job_id, user.id)
    await db.delete(job)
    await db.commit()
    _cleanup(get_settings().staging_root / job_id)


async def _owned(db, job_id: str, user_id: int) -> UploadJob:
    """Fetch a job, 404ing if it is not this user's. Never 403 — no existence leak."""
    result = await db.execute(
        select(UploadJob).where(UploadJob.id == job_id, UploadJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such upload")
    return job


def _cleanup(path: Path) -> None:
    import shutil

    shutil.rmtree(path, ignore_errors=True)
