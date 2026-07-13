"""Instance: one DICOM file (SOP Instance), possibly multi-frame."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Instance(Base, TimestampMixin):
    __tablename__ = "instances"
    __table_args__ = (
        # The dedup key. Re-uploading the same disc must be a no-op.
        UniqueConstraint("user_id", "sop_instance_uid", name="uq_instance_user_uid"),
        Index("ix_instances_series_order", "series_id", "instance_number", "sop_instance_uid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(ForeignKey("series.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    sop_instance_uid: Mapped[str] = mapped_column(String(64), index=True)
    sop_class_uid: Mapped[str | None] = mapped_column(String(64), default=None)
    instance_number: Mapped[int | None] = mapped_column(Integer, default=None)

    # Pixel geometry, denormalized for the frame route (which must slice raw PixelData
    # without re-parsing the header).
    number_of_frames: Mapped[int] = mapped_column(Integer, default=1)
    rows: Mapped[int | None] = mapped_column(Integer, default=None)
    columns: Mapped[int | None] = mapped_column(Integer, default=None)
    bits_allocated: Mapped[int | None] = mapped_column(Integer, default=None)
    samples_per_pixel: Mapped[int] = mapped_column(Integer, default=1)
    photometric_interpretation: Mapped[str | None] = mapped_column(String(32), default=None)

    transfer_syntax_uid: Mapped[str] = mapped_column(String(64), default="1.2.840.10008.1.2.1")

    # Geometry used by geometry.py to decide is_reconstructable.
    image_position_patient: Mapped[str | None] = mapped_column(String(96), default=None)
    image_orientation_patient: Mapped[str | None] = mapped_column(String(192), default=None)
    pixel_spacing: Mapped[str | None] = mapped_column(String(64), default=None)
    slice_location: Mapped[float | None] = mapped_column(Float, default=None)

    file_path: Mapped[str] = mapped_column(String(1024))  # relative to DICOM_ROOT
    file_size: Mapped[int] = mapped_column(Integer, default=0)

    # The full DICOM JSON of the header (no pixel data). Serving WADO-RS metadata is
    # then a pure DB read: concatenate these blobs into a JSON array, no re-serialize.
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")

    series: Mapped["Series"] = relationship(back_populates="instances")  # noqa: F821
