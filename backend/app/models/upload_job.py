"""UploadJob: tracks one ingest run, its progress and its per-file error report."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# Errors are capped so a pathological archive cannot bloat the row; error_count
# keeps counting past the cap.
MAX_STORED_ERRORS = 200


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RECEIVING = "receiving"
    EXTRACTING = "extracting"
    SCANNING = "scanning"
    IMPORTING = "importing"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATUSES = {
    JobStatus.COMPLETED,
    JobStatus.COMPLETED_WITH_ERRORS,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
}


class UploadJob(Base, TimestampMixin):
    __tablename__ = "upload_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid4
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[str] = mapped_column(String(32), default=JobStatus.PENDING.value)
    message: Mapped[str] = mapped_column(String(512), default="")

    source_names: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    bytes_received: Mapped[int] = mapped_column(Integer, default=0)

    total_files: Mapped[int] = mapped_column(Integer, default=0)
    processed_files: Mapped[int] = mapped_column(Integer, default=0)
    imported_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)

    errors: Mapped[str] = mapped_column(Text, default="[]")  # JSON list, capped
    study_uids: Mapped[str] = mapped_column(Text, default="[]")  # JSON list

    started_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
