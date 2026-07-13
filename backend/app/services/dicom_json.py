"""DICOM JSON (PS3.18 Annex F) construction for QIDO-RS and the tag inspector.

Two details that silently break real DICOMweb clients if you get them wrong:

* PersonName is NOT a bare string. It is an object with component groups:
      {"vr": "PN", "Value": [{"Alphabetic": "DOE^JOHN"}]}
* An absent value is an element with NO "Value" key at all — not null, not [].
"""

from __future__ import annotations

import json
from typing import Any

from pydicom.datadict import dictionary_VR, keyword_for_tag

from app.models import Instance, Series, Study

# Tags we return, as bare hex keys (DICOM JSON uses no parentheses or commas).
STUDY_DATE = "00080020"
STUDY_TIME = "00080030"
ACCESSION_NUMBER = "00080050"
MODALITIES_IN_STUDY = "00080061"
REFERRING_PHYSICIAN = "00080090"
STUDY_DESCRIPTION = "00081030"
RETRIEVE_URL = "00081190"
PATIENT_NAME = "00100010"
PATIENT_ID = "00100020"
PATIENT_BIRTH_DATE = "00100030"
PATIENT_SEX = "00100040"
STUDY_INSTANCE_UID = "0020000D"
STUDY_ID = "00200010"
NUM_STUDY_SERIES = "00201206"
NUM_STUDY_INSTANCES = "00201208"

MODALITY = "00080060"
SERIES_DATE = "00080021"
SERIES_TIME = "00080031"
SERIES_DESCRIPTION = "0008103E"
BODY_PART = "00180015"
SERIES_INSTANCE_UID = "0020000E"
SERIES_NUMBER = "00200011"
NUM_SERIES_INSTANCES = "00201209"

SOP_CLASS_UID = "00080016"
SOP_INSTANCE_UID = "00080018"
INSTANCE_NUMBER = "00200013"
NUMBER_OF_FRAMES = "00280008"
ROWS = "00280010"
COLUMNS = "00280011"
BITS_ALLOCATED = "00280100"
PHOTOMETRIC = "00280004"
PLANAR_CONFIG = "00280006"


def _el(vr: str, value: Any) -> dict:
    """One DICOM JSON element. An absent value yields no Value key, per the standard."""
    if value is None or value == "":
        return {"vr": vr}
    if not isinstance(value, list):
        value = [value]
    return {"vr": vr, "Value": value}


def _pn(value: str | None) -> dict:
    """PersonName: component-group object form, not a bare string."""
    if not value:
        return {"vr": "PN"}
    return {"vr": "PN", "Value": [{"Alphabetic": str(value)}]}


def study_json(study: Study, base_url: str) -> dict:
    return {
        STUDY_DATE: _el("DA", study.study_date),
        STUDY_TIME: _el("TM", study.study_time),
        ACCESSION_NUMBER: _el("SH", study.accession_number),
        MODALITIES_IN_STUDY: _el(
            "CS", [m for m in (study.modalities or "").split(",") if m] or None
        ),
        REFERRING_PHYSICIAN: _pn(study.referring_physician),
        STUDY_DESCRIPTION: _el("LO", study.study_description),
        PATIENT_NAME: _pn(study.patient_name),
        PATIENT_ID: _el("LO", study.patient_id),
        PATIENT_BIRTH_DATE: _el("DA", study.patient_birth_date),
        PATIENT_SEX: _el("CS", study.patient_sex),
        STUDY_INSTANCE_UID: _el("UI", study.study_instance_uid),
        STUDY_ID: _el("SH", study.study_id),
        NUM_STUDY_SERIES: _el("IS", study.num_series),
        NUM_STUDY_INSTANCES: _el("IS", study.num_instances),
        RETRIEVE_URL: _el("UR", f"{base_url}/studies/{study.study_instance_uid}"),
    }


def series_json(series: Series, study_uid: str, base_url: str) -> dict:
    return {
        MODALITY: _el("CS", series.modality),
        SERIES_DATE: _el("DA", series.series_date),
        SERIES_TIME: _el("TM", series.series_time),
        SERIES_DESCRIPTION: _el("LO", series.series_description),
        BODY_PART: _el("CS", series.body_part_examined),
        SERIES_INSTANCE_UID: _el("UI", series.series_instance_uid),
        SERIES_NUMBER: _el("IS", series.series_number),
        NUM_SERIES_INSTANCES: _el("IS", series.num_instances),
        RETRIEVE_URL: _el(
            "UR",
            f"{base_url}/studies/{study_uid}/series/{series.series_instance_uid}",
        ),
    }


def instance_json(instance: Instance, study_uid: str, series_uid: str, base_url: str) -> dict:
    return {
        SOP_CLASS_UID: _el("UI", instance.sop_class_uid),
        SOP_INSTANCE_UID: _el("UI", instance.sop_instance_uid),
        INSTANCE_NUMBER: _el("IS", instance.instance_number),
        NUMBER_OF_FRAMES: _el("IS", instance.number_of_frames),
        ROWS: _el("US", instance.rows),
        COLUMNS: _el("US", instance.columns),
        BITS_ALLOCATED: _el("US", instance.bits_allocated),
        RETRIEVE_URL: _el(
            "UR",
            f"{base_url}/studies/{study_uid}/series/{series_uid}"
            f"/instances/{instance.sop_instance_uid}",
        ),
    }


# ---- tag inspector -----------------------------------------------------------

# Rendering these inline would flood the inspector with base64.
_BINARY_VRS = {"OB", "OW", "OF", "OD", "OL", "OV", "UN"}


def flatten_tags(metadata_json: str) -> list[dict]:
    """Turn stored DICOM JSON into a flat, displayable tag table."""
    try:
        data = json.loads(metadata_json or "{}")
    except json.JSONDecodeError:
        return []

    rows: list[dict] = []
    for key in sorted(data):
        rows.extend(_render(key, data[key], depth=0))
    return rows


def _render(key: str, element: dict, depth: int) -> list[dict]:
    vr = element.get("vr", "UN")
    prefix = "  " * depth
    try:
        tag_int = int(key, 16)
        keyword = keyword_for_tag(tag_int) or ""
    except (ValueError, TypeError):
        keyword = ""

    formatted = f"{prefix}({key[:4]},{key[4:]})"
    row = {"tag": formatted, "keyword": keyword, "vr": vr, "value": _value(element, vr)}

    rows = [row]
    # Sequences: expand one level so the inspector shows structure without exploding.
    if vr == "SQ" and depth < 2:
        for item_index, item in enumerate(element.get("Value", []) or []):
            rows.append(
                {
                    "tag": f"{prefix}  item {item_index}",
                    "keyword": "",
                    "vr": "",
                    "value": "",
                }
            )
            for sub_key in sorted(item):
                rows.extend(_render(sub_key, item[sub_key], depth + 2))
    return rows


def _value(element: dict, vr: str) -> str:
    if vr == "SQ":
        return f"{len(element.get('Value', []) or [])} item(s)"
    if "Value" not in element:
        if "InlineBinary" in element or vr in _BINARY_VRS:
            return "<binary>"
        return ""

    values = element["Value"]
    parts: list[str] = []
    for value in values:
        if isinstance(value, dict):  # PersonName
            parts.append(str(value.get("Alphabetic", "")))
        else:
            parts.append(str(value))

    text = "\\".join(parts)
    return text if len(text) <= 200 else text[:200] + "…"


def dictionary_vr_safe(tag_int: int) -> str:
    try:
        return dictionary_VR(tag_int)
    except KeyError:
        return "UN"
