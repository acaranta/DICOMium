"""Upload job schemas."""

from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel

from app.models import UploadJob
from app.models.upload_job import TERMINAL_STATUSES, JobStatus


class UploadErrorOut(BaseModel):
    path: str
    stage: str
    error_type: str
    message: str


class UploadJobOut(BaseModel):
    id: str
    status: str
    message: str
    is_terminal: bool

    progress: float  # 0..1
    total_files: int
    processed_files: int
    imported_count: int
    duplicate_count: int
    skipped_count: int
    error_count: int

    source_names: list[str]
    errors: list[UploadErrorOut]
    study_uids: list[str]

    created_at: datetime
    finished_at: datetime | None

    @classmethod
    def from_row(cls, row: UploadJob) -> "UploadJobOut":
        status = JobStatus(row.status)
        terminal = status in TERMINAL_STATUSES

        # During extract/scan the denominator is unknown, so progress stays at 0 and the
        # UI shows an indeterminate bar rather than a bar that lurches backwards.
        if terminal:
            progress = 1.0
        elif row.total_files > 0:
            progress = min(row.processed_files / row.total_files, 1.0)
        else:
            progress = 0.0

        return cls(
            id=row.id,
            status=row.status,
            message=row.message,
            is_terminal=terminal,
            progress=progress,
            total_files=row.total_files,
            processed_files=row.processed_files,
            imported_count=row.imported_count,
            duplicate_count=row.duplicate_count,
            skipped_count=row.skipped_count,
            error_count=row.error_count,
            source_names=json.loads(row.source_names or "[]"),
            errors=json.loads(row.errors or "[]"),
            study_uids=json.loads(row.study_uids or "[]"),
            created_at=row.created_at,
            finished_at=row.finished_at,
        )
