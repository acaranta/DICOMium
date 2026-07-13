"""Header -> denormalized index fields + the DICOM JSON we serve over WADO-RS."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from pydicom import dcmread
from pydicom.dataset import Dataset

from app.models.series import NON_VIEWABLE_SOP_PREFIXES

log = logging.getLogger(__name__)

# Binary blobs we never want inline in the JSON: ICC profiles, private thumbnails,
# overlay planes. Emitted as an empty element instead of megabytes of base64.
BULK_DATA_THRESHOLD = 1024


class MissingUIDError(ValueError):
    """The file has no usable identity. It cannot be indexed."""


@dataclass
class InstanceMeta:
    # Identity
    study_uid: str
    series_uid: str
    sop_uid: str
    sop_class_uid: str | None

    # Patient / study
    patient_name: str
    patient_id: str
    patient_birth_date: str | None
    patient_sex: str | None
    study_date: str | None
    study_time: str | None
    study_description: str | None
    accession_number: str | None
    referring_physician: str | None
    study_id: str | None

    # Series
    series_number: int | None
    series_description: str | None
    modality: str
    body_part_examined: str | None
    protocol_name: str | None
    series_date: str | None
    series_time: str | None

    # Instance / pixels
    instance_number: int | None
    number_of_frames: int
    rows: int | None
    columns: int | None
    bits_allocated: int | None
    samples_per_pixel: int
    photometric_interpretation: str | None
    transfer_syntax_uid: str

    # Geometry
    image_position_patient: str | None
    image_orientation_patient: str | None
    pixel_spacing: str | None
    slice_location: float | None
    slice_thickness: float | None

    is_viewable: bool
    metadata_json: str


def _str(ds: Dataset, keyword: str) -> str | None:
    value = ds.get(keyword, None)
    if value is None or value == "":
        return None
    return str(value).strip() or None


def _int(ds: Dataset, keyword: str) -> int | None:
    value = ds.get(keyword, None)
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float(ds: Dataset, keyword: str) -> float | None:
    value = ds.get(keyword, None)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _csv(ds: Dataset, keyword: str) -> str | None:
    """Serialize a multi-valued numeric tag (IPP, IOP, PixelSpacing) as csv."""
    value = ds.get(keyword, None)
    if value is None:
        return None
    try:
        items = list(value) if not isinstance(value, str) else [value]
        return ",".join(str(float(v)) for v in items) or None
    except (TypeError, ValueError):
        return None


def _to_json(ds: Dataset) -> str:
    """Full DICOM JSON of the header.

    suppress_invalid_tags is essential: real-world discs are full of malformed private
    tags, and one of them must not take down the whole import.
    """
    try:
        payload = ds.to_json_dict(
            bulk_data_threshold=BULK_DATA_THRESHOLD,
            bulk_data_element_handler=lambda _de: None,
            suppress_invalid_tags=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("to_json_dict failed, falling back to a minimal header: %s", exc)
        payload = {}

    # PixelData never belongs in the metadata response.
    payload.pop("7FE00010", None)
    return json.dumps(payload, separators=(",", ":"))


def read_meta(path: Path) -> InstanceMeta:
    """Parse one file's header. Raises MissingUIDError if it cannot be identified."""
    ds = dcmread(path, stop_before_pixels=True, force=True)

    study_uid = _str(ds, "StudyInstanceUID")
    series_uid = _str(ds, "SeriesInstanceUID")
    sop_uid = _str(ds, "SOPInstanceUID")
    if not (study_uid and series_uid and sop_uid):
        missing = [
            name
            for name, val in (
                ("StudyInstanceUID", study_uid),
                ("SeriesInstanceUID", series_uid),
                ("SOPInstanceUID", sop_uid),
            )
            if not val
        ]
        raise MissingUIDError(f"missing {', '.join(missing)}")

    # The transfer syntax lives in the file meta, not the dataset. A forced read of a
    # preamble-less file has no file_meta at all: implicit VR LE is the correct default.
    transfer_syntax = "1.2.840.10008.1.2"
    if ds.file_meta is not None:
        transfer_syntax = str(
            ds.file_meta.get("TransferSyntaxUID", "1.2.840.10008.1.2")
        )

    sop_class = _str(ds, "SOPClassUID")
    is_viewable = not (
        sop_class and sop_class.startswith(NON_VIEWABLE_SOP_PREFIXES)
    )

    return InstanceMeta(
        study_uid=study_uid,
        series_uid=series_uid,
        sop_uid=sop_uid,
        sop_class_uid=sop_class,
        patient_name=_str(ds, "PatientName") or "UNKNOWN",
        patient_id=_str(ds, "PatientID") or "UNKNOWN",
        patient_birth_date=_str(ds, "PatientBirthDate"),
        patient_sex=_str(ds, "PatientSex"),
        study_date=_str(ds, "StudyDate"),
        study_time=_str(ds, "StudyTime"),
        study_description=_str(ds, "StudyDescription"),
        accession_number=_str(ds, "AccessionNumber"),
        referring_physician=_str(ds, "ReferringPhysicianName"),
        study_id=_str(ds, "StudyID"),
        series_number=_int(ds, "SeriesNumber"),
        series_description=_str(ds, "SeriesDescription"),
        modality=_str(ds, "Modality") or "OT",
        body_part_examined=_str(ds, "BodyPartExamined"),
        protocol_name=_str(ds, "ProtocolName"),
        series_date=_str(ds, "SeriesDate"),
        series_time=_str(ds, "SeriesTime"),
        instance_number=_int(ds, "InstanceNumber"),
        number_of_frames=_int(ds, "NumberOfFrames") or 1,
        rows=_int(ds, "Rows"),
        columns=_int(ds, "Columns"),
        bits_allocated=_int(ds, "BitsAllocated"),
        samples_per_pixel=_int(ds, "SamplesPerPixel") or 1,
        photometric_interpretation=_str(ds, "PhotometricInterpretation"),
        transfer_syntax_uid=transfer_syntax,
        image_position_patient=_csv(ds, "ImagePositionPatient"),
        image_orientation_patient=_csv(ds, "ImageOrientationPatient"),
        pixel_spacing=_csv(ds, "PixelSpacing"),
        slice_location=_float(ds, "SliceLocation"),
        slice_thickness=_float(ds, "SliceThickness"),
        is_viewable=is_viewable,
        metadata_json=_to_json(ds),
    )
