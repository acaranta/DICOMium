"""Series: one acquisition within a study."""

from __future__ import annotations

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

# SOP classes we index but cannot render in the stack viewer. Greyed out in the UI
# rather than allowed to fail the viewer at load time.
NON_VIEWABLE_SOP_PREFIXES = (
    "1.2.840.10008.5.1.4.1.1.88",  # Structured Reporting
    "1.2.840.10008.5.1.4.1.1.9",  # Waveforms (ECG)
    "1.2.840.10008.5.1.4.1.1.104",  # Encapsulated PDF/CDA
    "1.2.840.10008.5.1.4.1.1.66",  # Raw data / segmentation / registration
)


class Series(Base, TimestampMixin):
    __tablename__ = "series"
    __table_args__ = (
        UniqueConstraint("user_id", "series_instance_uid", name="uq_series_user_uid"),
        Index("ix_series_study_number", "study_id", "series_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    # Denormalized so isolation filters never need a join.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    series_instance_uid: Mapped[str] = mapped_column(String(64), index=True)
    series_number: Mapped[int | None] = mapped_column(Integer, default=None)
    series_description: Mapped[str | None] = mapped_column(String(256), default=None)
    modality: Mapped[str] = mapped_column(String(16), default="OT")
    body_part_examined: Mapped[str | None] = mapped_column(String(64), default=None)
    protocol_name: Mapped[str | None] = mapped_column(String(128), default=None)
    series_date: Mapped[str | None] = mapped_column(String(8), default=None)
    series_time: Mapped[str | None] = mapped_column(String(16), default=None)

    num_instances: Mapped[int] = mapped_column(Integer, default=0)
    num_frames_total: Mapped[int] = mapped_column(Integer, default=0)
    rows: Mapped[int | None] = mapped_column(Integer, default=None)
    columns: Mapped[int | None] = mapped_column(Integer, default=None)
    is_multiframe: Mapped[bool] = mapped_column(Boolean, default=False)

    # Gates the MPR button. Computed once at ingest so the browser never has to
    # discover irregular spacing the hard way.
    is_reconstructable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_viewable: Mapped[bool] = mapped_column(Boolean, default=True)

    # Reformat series embed a few off-plane reference images among the real slices.
    # When set, MPR loads only the instances whose IOP matches this; the 2D stack
    # viewer still shows every image. NULL means "the whole series is the volume".
    mpr_orientation: Mapped[str | None] = mapped_column(String(192), default=None)
    mpr_instance_count: Mapped[int] = mapped_column(Integer, default=0)

    slice_thickness: Mapped[float | None] = mapped_column(Float, default=None)
    computed_slice_spacing: Mapped[float | None] = mapped_column(Float, default=None)

    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    dir_path: Mapped[str] = mapped_column(String(1024))

    study: Mapped["Study"] = relationship(back_populates="series")  # noqa: F821
    instances: Mapped[list["Instance"]] = relationship(  # noqa: F821
        back_populates="series", cascade="all, delete-orphan"
    )
