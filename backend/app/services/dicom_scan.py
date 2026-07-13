"""Finding the DICOM files inside an extracted upload.

Two hard-won rules, both proven by the DVDs in dicomdata/:

1. Detection is by content, not extension. The files on those discs are named A0001,
   B0001 ... with no extension whatsoever.
2. A DICOMDIR is used as a hint, never as the source of truth. Burned-CD DICOMDIRs are
   routinely stale or incomplete, so we always walk the whole tree as well and union the
   two sets.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from pydicom import dcmread
from pydicom.errors import InvalidDicomError

log = logging.getLogger(__name__)

DICM_MAGIC = b"DICM"
DICM_OFFSET = 128
PREAMBLE_LEN = 132

# Junk that lives on every burned disc. Matched only to keep the log quiet — anything
# that fails DICOM detection is skipped regardless, this is not a security control.
KNOWN_JUNK_SUFFIXES = {
    ".exe", ".dll", ".chm", ".pdf", ".ico", ".jpg", ".jpeg", ".png", ".gif",
    ".icns", ".inf", ".ini", ".txt", ".htm", ".html", ".plist", ".zip", ".app",
    ".ifo", ".lst", ".stj", ".dpt", ".ds_store",
}


@dataclass
class ScanResult:
    dicom_files: list[Path] = field(default_factory=list)
    skipped: int = 0
    used_dicomdir: bool = False
    dicomdir_referenced: int = 0


def is_dicom(path: Path) -> bool:
    """True if `path` is a DICOM file.

    Fast path: the Part 10 preamble ('DICM' at offset 128). Slow path: old burners emit
    preamble-less files, so fall back to a forced header parse and require both a
    SOPClassUID and a SOPInstanceUID before believing it.
    """
    try:
        with path.open("rb") as fh:
            head = fh.read(PREAMBLE_LEN)
    except OSError:
        return False

    if len(head) >= PREAMBLE_LEN and head[DICM_OFFSET:PREAMBLE_LEN] == DICM_MAGIC:
        return True

    # Not worth a forced parse on things we know are not DICOM.
    if path.suffix.lower() in KNOWN_JUNK_SUFFIXES:
        return False

    try:
        ds = dcmread(path, stop_before_pixels=True, force=True)
    except (InvalidDicomError, OSError, ValueError, AttributeError):
        return False

    return bool(getattr(ds, "SOPClassUID", None)) and bool(getattr(ds, "SOPInstanceUID", None))


def _read_dicomdir(dicomdir: Path) -> list[Path]:
    """Return the instance paths a DICOMDIR references. Best-effort by design."""
    try:
        ds = dcmread(dicomdir)
    except Exception as exc:  # noqa: BLE001 - a bad DICOMDIR must not fail the import
        log.warning("unreadable DICOMDIR at %s: %s", dicomdir, exc)
        return []

    base = dicomdir.parent
    found: list[Path] = []

    # Walk the record tree rather than using FileSet: FileSet is strict about
    # conformance and raises on the malformed DICOMDIRs that discs actually ship.
    for record in ds.get("DirectoryRecordSequence", []):
        file_id = getattr(record, "ReferencedFileID", None)
        if not file_id:
            continue
        parts = [file_id] if isinstance(file_id, str) else list(file_id)
        candidate = base.joinpath(*[str(p) for p in parts])
        if candidate.is_file():
            found.append(candidate)

    return found


def scan(root: Path) -> ScanResult:
    """Find every DICOM instance under `root`."""
    result = ScanResult()
    seen: set[Path] = set()

    # DICOMDIR first, as a hint.
    for dicomdir in root.rglob("DICOMDIR"):
        if not dicomdir.is_file():
            continue
        referenced = _read_dicomdir(dicomdir)
        result.used_dicomdir = True
        result.dicomdir_referenced += len(referenced)
        for path in referenced:
            resolved = path.resolve()
            if resolved not in seen and is_dicom(path):
                seen.add(resolved)
                result.dicom_files.append(path)

    # Then the full walk, unioned in. This is what catches the instances a stale
    # DICOMDIR forgot to list.
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        if path.name == "DICOMDIR":
            continue

        resolved = path.resolve()
        if resolved in seen:
            continue

        if is_dicom(path):
            seen.add(resolved)
            result.dicom_files.append(path)
        else:
            # Bundled viewers, PDFs, autorun stubs. Skipped, never an error.
            result.skipped += 1

    result.dicom_files.sort()
    log.info(
        "scan of %s: %d dicom, %d skipped (dicomdir=%s, referenced=%d)",
        root, len(result.dicom_files), result.skipped,
        result.used_dicomdir, result.dicomdir_referenced,
    )
    return result
