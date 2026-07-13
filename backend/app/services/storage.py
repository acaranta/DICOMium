"""Target-path construction and the filesystem containment guard.

Layout:
    <root>/<user_slug>/<Patient>__<PatientID>/<Date>_<Desc>_<uid8>/<Num>_<Desc>_<uid8>/<sop>.dcm

Nothing here trusts its input. Every path is rebuilt from slugified components and then
re-checked against the user's root before it is handed back, so a malicious tag value
cannot escape even if a slug rule is later loosened.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from app.services.slug import UNKNOWN, is_valid_uid, short_uid, slugify


class PathEscapeError(RuntimeError):
    """A built path resolved outside the user's root. Always a bug or an attack."""


@dataclass(frozen=True)
class InstancePaths:
    patient_dir: Path  # all relative to DICOM_ROOT
    study_dir: Path
    series_dir: Path
    file_path: Path


def user_root(root: Path, user_slug: str) -> Path:
    return root / slugify(user_slug, maxlen=64)


def ensure_within(root: Path, user_slug: str, candidate: Path) -> Path:
    """Resolve `candidate` and assert it lives under the user's root.

    Called before every write and every delete. `candidate` may be relative to root.
    """
    base = user_root(root, user_slug).resolve()
    target = candidate if candidate.is_absolute() else (root / candidate)
    resolved = target.resolve()

    if resolved != base and not resolved.is_relative_to(base):
        raise PathEscapeError(f"{resolved} escapes {base}")
    return resolved


def build_instance_paths(
    user_slug: str,
    patient_name: str | None,
    patient_id: str | None,
    study_date: str | None,
    study_description: str | None,
    study_uid: str,
    series_number: int | None,
    series_description: str | None,
    series_uid: str,
    sop_uid: str,
) -> InstancePaths:
    """Build the relative on-disk paths for one instance."""
    if not is_valid_uid(sop_uid):
        raise ValueError(f"refusing to build a path for a non-UID SOPInstanceUID: {sop_uid!r}")

    # Patient: name plus ID, so two patients sharing a name never collide.
    name_part = slugify(patient_name, maxlen=64)
    id_part = slugify(patient_id, maxlen=32)
    if id_part == UNKNOWN:
        # No PatientID at all: fall back to the study digest so the dir is still unique.
        id_part = f"NOID_{short_uid(study_uid)}"
    patient_dir = Path(slugify(user_slug, maxlen=64)) / f"{name_part}__{id_part}"

    # Study: date, optional description, and a digest to break same-day collisions.
    study_parts = [study_date if (study_date and study_date.isdigit()) else "NODATE"]
    desc = slugify(study_description, maxlen=48)
    if desc != UNKNOWN:
        study_parts.append(desc)
    study_parts.append(short_uid(study_uid))
    study_dir = patient_dir / "_".join(study_parts)

    # Series: zero-padded number, optional description, digest.
    series_parts = [f"{series_number:03d}" if series_number is not None else "000"]
    sdesc = slugify(series_description, maxlen=48)
    if sdesc != UNKNOWN:
        series_parts.append(sdesc)
    series_parts.append(short_uid(series_uid))
    series_dir = study_dir / "_".join(series_parts)

    return InstancePaths(
        patient_dir=patient_dir,
        study_dir=study_dir,
        series_dir=series_dir,
        file_path=series_dir / f"{sop_uid}.dcm",
    )


def delete_tree(root: Path, user_slug: str, relative_dir: str | Path) -> None:
    """Remove a study/series directory, then prune directories left empty."""
    target = ensure_within(root, user_slug, Path(relative_dir))
    if not target.exists():
        return
    shutil.rmtree(target)

    base = user_root(root, user_slug).resolve()
    parent = target.parent
    while parent != base and parent.is_relative_to(base):
        try:
            next(parent.iterdir())
            break  # not empty
        except StopIteration:
            parent.rmdir()
            parent = parent.parent
        except OSError:
            break
