"""The ingest pipeline: staged upload -> extracted tree -> indexed files on disk.

Runs as a long-lived asyncio task (see jobs.py), not a FastAPI BackgroundTask, because
it must outlive the response and be cancellable.

Threading contract: every blocking call (dcmread, decode, file moves) is pushed to a
worker thread via anyio.to_thread; every DB write stays on the event loop. There is
exactly one writer and no session is ever shared across threads.
"""

from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import anyio
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.models import Instance, JobStatus, Series, Study, UploadJob, User
from app.models.upload_job import MAX_STORED_ERRORS
from app.services import archive, dicom_scan, geometry, jobs, storage, thumbnails
from app.services.dicom_meta import InstanceMeta, MissingUIDError, read_meta

log = logging.getLogger(__name__)


@dataclass
class _Counters:
    imported: int = 0
    duplicates: int = 0
    skipped: int = 0
    errors: int = 0
    processed: int = 0


class _Job:
    """Mutable state for one ingest run."""

    def __init__(self, job_id: str, user: User, settings: Settings):
        self.id = job_id
        self.user = user
        self.settings = settings
        self.counters = _Counters()
        self.errors: list[dict] = []
        self.study_uids: set[str] = set()
        self.touched_series: set[int] = set()

    def record_error(self, path: Path | str, stage: str, error_type: str, message: str) -> None:
        self.counters.errors += 1
        if len(self.errors) < MAX_STORED_ERRORS:
            self.errors.append(
                {
                    "path": Path(path).name,
                    "stage": stage,
                    "error_type": error_type,
                    "message": str(message)[:300],
                }
            )


async def run_ingest(
    job_id: str,
    user_id: int,
    sessionmaker: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> None:
    """Entry point for the ingest task. Never raises: failures land on the job row."""
    staging = settings.staging_root / job_id
    async with sessionmaker() as db:
        user = await db.get(User, user_id)
        if user is None:
            log.error("ingest %s: user %s vanished", job_id, user_id)
            return

        job = _Job(job_id, user, settings)
        try:
            await _pipeline(db, job, staging)
        except archive.ArchiveError as exc:
            # Archive-level guards (zip-slip, bombs, corruption) fail the whole job.
            log.warning("ingest %s rejected: %s", job_id, exc)
            await _finish(db, job, JobStatus.FAILED, str(exc), exc.code)
        except Exception as exc:  # noqa: BLE001
            log.exception("ingest %s crashed", job_id)
            await _finish(db, job, JobStatus.FAILED, f"Import failed: {exc}", "ingest.failed")
        finally:
            await anyio.to_thread.run_sync(lambda: shutil.rmtree(staging, ignore_errors=True))
            jobs.clear(job_id)


async def _pipeline(db: AsyncSession, job: _Job, staging: Path) -> None:
    settings = job.settings
    incoming = staging / "incoming"
    extracted = staging / "extracted"

    # ---- Extract -------------------------------------------------------------
    await _update(db, job, status=JobStatus.EXTRACTING, message="Extracting archive")
    extracted.mkdir(parents=True, exist_ok=True)

    received = sorted(incoming.iterdir()) if incoming.exists() else []
    if not received:
        await _finish(
            db, job, JobStatus.FAILED, "Nothing was uploaded", "ingest.nothing_uploaded"
        )
        return

    for item in received:
        kind = await anyio.to_thread.run_sync(archive.detect, item)
        if kind == "raw":
            # A loose DICOM file dropped straight in.
            await anyio.to_thread.run_sync(shutil.move, str(item), str(extracted / item.name))
        else:
            await anyio.to_thread.run_sync(
                archive.extract,
                item,
                extracted,
                settings.max_extract_mb * 1024 * 1024,
                settings.max_extract_members,
            )

    if _cancelled(job):
        await _finish(db, job, JobStatus.CANCELLED, "Cancelled", "ingest.cancelled")
        return

    # ---- Scan ----------------------------------------------------------------
    await _update(db, job, status=JobStatus.SCANNING, message="Looking for DICOM files")
    scan = await anyio.to_thread.run_sync(dicom_scan.scan, extracted)

    job.counters.skipped = scan.skipped
    if not scan.dicom_files:
        await _finish(
            db,
            job,
            JobStatus.FAILED,
            "No DICOM files found in the upload",
            "ingest.no_dicom_found",
        )
        return

    note = f"Found {len(scan.dicom_files)} DICOM files"
    if scan.used_dicomdir:
        note += " (DICOMDIR present)"
    await _update(
        db, job, status=JobStatus.IMPORTING, message=note, total_files=len(scan.dicom_files)
    )

    # ---- Import --------------------------------------------------------------
    for path in scan.dicom_files:
        if _cancelled(job):
            await _flush(db, job)
            await _finish(db, job, JobStatus.CANCELLED, "Cancelled", "ingest.cancelled")
            return

        await _import_one(db, job, path)
        job.counters.processed += 1

        if job.counters.processed % settings.commit_batch_size == 0:
            await _flush(db, job)

    await _flush(db, job)

    # ---- Finalize ------------------------------------------------------------
    await _update(db, job, status=JobStatus.FINALIZING, message="Building thumbnails")
    await _finalize_series(db, job)
    await _finalize_studies(db, job)

    counters = job.counters
    if counters.imported == 0 and counters.duplicates == 0:
        await _finish(
            db, job, JobStatus.FAILED, "Nothing could be imported", "ingest.nothing_imported"
        )
    elif counters.errors > 0:
        await _finish(
            db,
            job,
            JobStatus.COMPLETED_WITH_ERRORS,
            f"Imported {counters.imported} files; {counters.errors} could not be imported",
            "ingest.completed_with_errors",
        )
    else:
        await _finish(
            db,
            job,
            JobStatus.COMPLETED,
            f"Imported {counters.imported} files",
            "ingest.completed",
        )


async def _import_one(db: AsyncSession, job: _Job, path: Path) -> None:
    """Parse, dedupe, place and index a single file. Errors are per-file, never fatal."""
    try:
        meta = await anyio.to_thread.run_sync(read_meta, path)
    except MissingUIDError as exc:
        job.record_error(path, "parse", "MissingUID", str(exc))
        return
    except Exception as exc:  # noqa: BLE001
        job.record_error(path, "parse", "UnreadableDicom", str(exc))
        return

    # Dedupe: re-uploading the same disc must be a no-op.
    existing = await db.execute(
        select(Instance.id).where(
            Instance.user_id == job.user.id,
            Instance.sop_instance_uid == meta.sop_uid,
        )
    )
    if existing.scalar_one_or_none() is not None:
        job.counters.duplicates += 1
        return

    try:
        study = await _upsert_study(db, job, meta)
        series = await _upsert_series(db, job, meta, study)
        paths = storage.build_instance_paths(
            user_slug=job.user.slug,
            patient_name=meta.patient_name,
            patient_id=meta.patient_id,
            study_date=meta.study_date,
            study_description=meta.study_description,
            study_uid=meta.study_uid,
            series_number=meta.series_number,
            series_description=meta.series_description,
            series_uid=meta.series_uid,
            sop_uid=meta.sop_uid,
        )
        target = storage.ensure_within(job.settings.dicom_root, job.user.slug, paths.file_path)
    except (ValueError, storage.PathEscapeError) as exc:
        job.record_error(path, "store", "BadPath", str(exc))
        return

    try:
        size = await anyio.to_thread.run_sync(_place, path, target)
    except OSError as exc:
        job.record_error(path, "store", "IOError", str(exc))
        return

    db.add(
        Instance(
            series_id=series.id,
            user_id=job.user.id,
            sop_instance_uid=meta.sop_uid,
            sop_class_uid=meta.sop_class_uid,
            instance_number=meta.instance_number,
            number_of_frames=meta.number_of_frames,
            rows=meta.rows,
            columns=meta.columns,
            bits_allocated=meta.bits_allocated,
            samples_per_pixel=meta.samples_per_pixel,
            photometric_interpretation=meta.photometric_interpretation,
            transfer_syntax_uid=meta.transfer_syntax_uid,
            image_position_patient=meta.image_position_patient,
            image_orientation_patient=meta.image_orientation_patient,
            pixel_spacing=meta.pixel_spacing,
            slice_location=meta.slice_location,
            file_path=str(paths.file_path),
            file_size=size,
            metadata_json=meta.metadata_json,
        )
    )
    job.counters.imported += 1
    job.study_uids.add(meta.study_uid)
    job.touched_series.add(series.id)


def _place(src: Path, dst: Path) -> int:
    """Move a staged file into the store. Same filesystem, so this is a rename."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    size = src.stat().st_size
    try:
        src.replace(dst)
    except OSError:
        shutil.move(str(src), str(dst))  # cross-device fallback
    return size


async def _upsert_study(db: AsyncSession, job: _Job, meta: InstanceMeta) -> Study:
    result = await db.execute(
        select(Study).where(
            Study.user_id == job.user.id,
            Study.study_instance_uid == meta.study_uid,
        )
    )
    study = result.scalar_one_or_none()
    if study is not None:
        return study

    paths = storage.build_instance_paths(
        user_slug=job.user.slug,
        patient_name=meta.patient_name,
        patient_id=meta.patient_id,
        study_date=meta.study_date,
        study_description=meta.study_description,
        study_uid=meta.study_uid,
        series_number=meta.series_number,
        series_description=meta.series_description,
        series_uid=meta.series_uid,
        sop_uid=meta.sop_uid,
    )
    study = Study(
        user_id=job.user.id,
        study_instance_uid=meta.study_uid,
        patient_name=meta.patient_name,
        patient_id=meta.patient_id,
        patient_birth_date=meta.patient_birth_date,
        patient_sex=meta.patient_sex,
        study_date=meta.study_date,
        study_time=meta.study_time,
        study_description=meta.study_description,
        accession_number=meta.accession_number,
        referring_physician=meta.referring_physician,
        study_id=meta.study_id,
        dir_path=str(paths.study_dir),
    )
    db.add(study)
    try:
        await db.flush()
    except IntegrityError:
        # A concurrent job created it first.
        await db.rollback()
        result = await db.execute(
            select(Study).where(
                Study.user_id == job.user.id,
                Study.study_instance_uid == meta.study_uid,
            )
        )
        study = result.scalar_one()
    return study


async def _upsert_series(
    db: AsyncSession, job: _Job, meta: InstanceMeta, study: Study
) -> Series:
    result = await db.execute(
        select(Series).where(
            Series.user_id == job.user.id,
            Series.series_instance_uid == meta.series_uid,
        )
    )
    series = result.scalar_one_or_none()
    if series is not None:
        return series

    paths = storage.build_instance_paths(
        user_slug=job.user.slug,
        patient_name=meta.patient_name,
        patient_id=meta.patient_id,
        study_date=meta.study_date,
        study_description=meta.study_description,
        study_uid=meta.study_uid,
        series_number=meta.series_number,
        series_description=meta.series_description,
        series_uid=meta.series_uid,
        sop_uid=meta.sop_uid,
    )
    series = Series(
        study_id=study.id,
        user_id=job.user.id,
        series_instance_uid=meta.series_uid,
        series_number=meta.series_number,
        series_description=meta.series_description,
        modality=meta.modality,
        body_part_examined=meta.body_part_examined,
        protocol_name=meta.protocol_name,
        series_date=meta.series_date,
        series_time=meta.series_time,
        rows=meta.rows,
        columns=meta.columns,
        is_multiframe=meta.number_of_frames > 1,
        is_viewable=meta.is_viewable,
        slice_thickness=meta.slice_thickness,
        dir_path=str(paths.series_dir),
    )
    db.add(series)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(Series).where(
                Series.user_id == job.user.id,
                Series.series_instance_uid == meta.series_uid,
            )
        )
        series = result.scalar_one()
    return series


async def _finalize_series(db: AsyncSession, job: _Job) -> None:
    """Per-series counts, geometry, and a thumbnail from the middle slice."""
    settings = job.settings

    for series_id in sorted(job.touched_series):
        series = await db.get(Series, series_id)
        if series is None:
            continue

        result = await db.execute(
            select(Instance)
            .where(Instance.series_id == series_id)
            .order_by(Instance.instance_number, Instance.sop_instance_uid)
        )
        instances = list(result.scalars().all())
        if not instances:
            continue

        series.num_instances = len(instances)
        series.num_frames_total = sum(i.number_of_frames for i in instances)

        geo = geometry.analyze(
            [
                geometry.SliceInfo(
                    image_position_patient=i.image_position_patient,
                    image_orientation_patient=i.image_orientation_patient,
                    pixel_spacing=i.pixel_spacing,
                    rows=i.rows,
                    columns=i.columns,
                    number_of_frames=i.number_of_frames,
                )
                for i in instances
            ]
        )
        series.is_reconstructable = geo.is_reconstructable and series.is_viewable
        series.computed_slice_spacing = geo.slice_spacing
        series.mpr_orientation = geo.mpr_orientation
        series.mpr_instance_count = geo.mpr_instance_count
        log.debug("series %s geometry: %s", series.series_instance_uid, geo.reason)

        if series.is_viewable and not series.thumbnail_path:
            middle = instances[len(instances) // 2]
            src = settings.dicom_root / middle.file_path
            out = settings.thumbs_dir / f"{series.series_instance_uid}.png"
            ok = await anyio.to_thread.run_sync(
                thumbnails.render, src, out, settings.thumbnail_size
            )
            if ok:
                series.thumbnail_path = str(out.relative_to(settings.data_dir))

    await db.commit()


async def _finalize_studies(db: AsyncSession, job: _Job) -> None:
    for study_uid in sorted(job.study_uids):
        result = await db.execute(
            select(Study).where(
                Study.user_id == job.user.id,
                Study.study_instance_uid == study_uid,
            )
        )
        study = result.scalar_one_or_none()
        if study is None:
            continue

        series_result = await db.execute(select(Series).where(Series.study_id == study.id))
        series_list = list(series_result.scalars().all())

        study.num_series = len(series_list)
        study.num_instances = sum(s.num_instances for s in series_list)
        study.modalities = ",".join(sorted({s.modality for s in series_list if s.modality}))

    await db.commit()


# ---- job-row plumbing --------------------------------------------------------


def _cancelled(job: _Job) -> bool:
    return jobs.is_cancelled(job.id)


async def _flush(db: AsyncSession, job: _Job) -> None:
    """Commit the batch and publish progress in the same transaction, so the poll
    endpoint never sees counts that run ahead of the data."""
    row = await db.get(UploadJob, job.id)
    if row is not None:
        c = job.counters
        row.processed_files = c.processed
        row.imported_count = c.imported
        row.duplicate_count = c.duplicates
        row.skipped_count = c.skipped
        row.error_count = c.errors
        row.errors = json.dumps(job.errors)
        row.study_uids = json.dumps(sorted(job.study_uids))
    await db.commit()


async def _update(db: AsyncSession, job: _Job, **fields) -> None:
    row = await db.get(UploadJob, job.id)
    if row is None:
        return
    for key, value in fields.items():
        setattr(row, key, value.value if isinstance(value, JobStatus) else value)
    if row.started_at is None:
        row.started_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()


async def _finish(
    db: AsyncSession, job: _Job, status: JobStatus, message: str, code: str = ""
) -> None:
    await _flush(db, job)
    row = await db.get(UploadJob, job.id)
    if row is None:
        return
    row.status = status.value
    row.message = message[:512]
    row.message_code = code[:64]
    row.finished_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    log.info("ingest %s finished: %s (%s)", job.id, status.value, message)
