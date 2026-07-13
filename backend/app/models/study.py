"""Study: one imaging exam for one patient."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Study(Base, TimestampMixin):
    __tablename__ = "studies"
    __table_args__ = (
        UniqueConstraint("user_id", "study_instance_uid", name="uq_study_user_uid"),
        Index("ix_studies_user_date", "user_id", "study_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    study_instance_uid: Mapped[str] = mapped_column(String(64), index=True)

    # Patient (0010,xxxx)
    patient_name: Mapped[str] = mapped_column(String(256), default="UNKNOWN")
    patient_id: Mapped[str] = mapped_column(String(64), default="UNKNOWN")
    patient_birth_date: Mapped[str | None] = mapped_column(String(16), default=None)
    patient_sex: Mapped[str | None] = mapped_column(String(4), default=None)

    # Study (0008,xxxx / 0020,xxxx). study_date is kept as the raw DICOM DA string
    # (YYYYMMDD) because it sorts lexicographically and never needs a timezone.
    study_date: Mapped[str | None] = mapped_column(String(8), default=None, index=True)
    study_time: Mapped[str | None] = mapped_column(String(16), default=None)
    study_description: Mapped[str | None] = mapped_column(String(256), default=None)
    accession_number: Mapped[str | None] = mapped_column(String(64), default=None)
    referring_physician: Mapped[str | None] = mapped_column(String(256), default=None)
    study_id: Mapped[str | None] = mapped_column(String(32), default=None)

    modalities: Mapped[str] = mapped_column(String(128), default="")  # csv, from series
    num_series: Mapped[int] = mapped_column(Integer, default=0)
    num_instances: Mapped[int] = mapped_column(Integer, default=0)

    dir_path: Mapped[str] = mapped_column(String(1024))  # relative to DICOM_ROOT

    series: Mapped[list["Series"]] = relationship(  # noqa: F821
        back_populates="study", cascade="all, delete-orphan"
    )
