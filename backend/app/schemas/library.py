"""Library (study/series/instance browsing) schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models import Series, Study


class SeriesOut(BaseModel):
    series_instance_uid: str
    series_number: int | None
    series_description: str | None
    modality: str
    body_part_examined: str | None
    num_instances: int
    num_frames_total: int
    rows: int | None
    columns: int | None
    is_multiframe: bool
    is_viewable: bool
    is_reconstructable: bool
    mpr_instance_count: int
    slice_spacing: float | None
    has_thumbnail: bool

    @classmethod
    def from_row(cls, row: Series) -> "SeriesOut":
        return cls(
            series_instance_uid=row.series_instance_uid,
            series_number=row.series_number,
            series_description=row.series_description,
            modality=row.modality,
            body_part_examined=row.body_part_examined,
            num_instances=row.num_instances,
            num_frames_total=row.num_frames_total,
            rows=row.rows,
            columns=row.columns,
            is_multiframe=row.is_multiframe,
            is_viewable=row.is_viewable,
            is_reconstructable=row.is_reconstructable,
            mpr_instance_count=row.mpr_instance_count,
            slice_spacing=row.computed_slice_spacing,
            has_thumbnail=row.thumbnail_path is not None,
        )


class StudyOut(BaseModel):
    study_instance_uid: str
    patient_name: str
    patient_id: str
    patient_birth_date: str | None
    patient_sex: str | None
    study_date: str | None
    study_time: str | None
    study_description: str | None
    accession_number: str | None
    modalities: list[str]
    num_series: int
    num_instances: int
    created_at: datetime

    @classmethod
    def from_row(cls, row: Study) -> "StudyOut":
        return cls(
            study_instance_uid=row.study_instance_uid,
            patient_name=row.patient_name,
            patient_id=row.patient_id,
            patient_birth_date=row.patient_birth_date,
            patient_sex=row.patient_sex,
            study_date=row.study_date,
            study_time=row.study_time,
            study_description=row.study_description,
            accession_number=row.accession_number,
            modalities=[m for m in (row.modalities or "").split(",") if m],
            num_series=row.num_series,
            num_instances=row.num_instances,
            created_at=row.created_at,
        )


class StudyPageOut(BaseModel):
    """One page of studies, and how many there are in total.

    The total is the whole reason this is an envelope rather than a bare list. Without it the
    interface can only count the rows it was given, which is how a library of 3 000 exams came
    to describe itself as 100.
    """

    items: list[StudyOut]
    #: Studies matching the current filters — NOT the size of the whole library.
    total: int
    limit: int
    offset: int


class StudyDetailOut(StudyOut):
    series: list[SeriesOut]


class TagOut(BaseModel):
    tag: str  # "(0008,0060)"
    keyword: str
    vr: str
    value: str
