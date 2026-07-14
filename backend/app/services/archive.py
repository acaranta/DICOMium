"""Archive detection and safe extraction.

Format is sniffed from magic bytes, never from the extension — the DICOM files on a
burned DVD have no extension at all, and the archive itself may be named anything.

Nested archives are deliberately NOT extracted. The CT DVD in dicomdata/ ships an
"OsiriX Launcher.app" containing "OsiriX Lite.zip" — a whole bundled macOS viewer.
Recursing would unpack an application on every upload for zero benefit.
"""

from __future__ import annotations

import logging
import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

from app.errors import CodedError

log = logging.getLogger(__name__)

ZIP_MAGIC = b"PK\x03\x04"
GZIP_MAGIC = b"\x1f\x8b"
BZIP2_MAGIC = b"BZh"
XZ_MAGIC = b"\xfd7zXZ\x00"
TAR_MAGIC_OFFSET = 257
TAR_MAGIC = b"ustar"


class ArchiveError(CodedError):
    """The archive is unsafe or unreadable. Fails the whole job."""

    default_code = "ingest.archive_corrupt"


@dataclass
class ExtractResult:
    files_written: int
    bytes_written: int


def detect(path: Path) -> str:
    """Return 'zip', 'tar' or 'raw'."""
    try:
        with path.open("rb") as fh:
            head = fh.read(512)
    except OSError as exc:
        raise ArchiveError(
            f"cannot read {path.name}: {exc}",
            code="ingest.archive_unreadable",
            name=path.name,
        ) from exc

    if head.startswith(ZIP_MAGIC):
        return "zip"
    if head.startswith((GZIP_MAGIC, BZIP2_MAGIC, XZ_MAGIC)):
        return "tar"  # tarfile sniffs the compression itself
    if head[TAR_MAGIC_OFFSET : TAR_MAGIC_OFFSET + 5] == TAR_MAGIC:
        return "tar"
    return "raw"


def _safe_target(dest: Path, member_name: str) -> Path | None:
    """Resolve a member to a path inside `dest`, or None if it tries to escape.

    Covers zip-slip: absolute paths, '..' traversal, and drive-letter/UNC prefixes.
    """
    name = member_name.replace("\\", "/")
    if not name or name.endswith("/"):
        return None

    pure = Path(name)
    if pure.is_absolute() or ".." in pure.parts:
        return None
    # Windows-style absolute paths survive PurePosixPath parsing.
    if len(name) > 1 and name[1] == ":":
        return None

    target = (dest / pure).resolve()
    if not target.is_relative_to(dest.resolve()):
        return None
    return target


def extract(
    src: Path,
    dest: Path,
    max_bytes: int,
    max_members: int,
) -> ExtractResult:
    """Extract `src` into `dest`. Raises ArchiveError on anything unsafe."""
    kind = detect(src)
    dest.mkdir(parents=True, exist_ok=True)

    if kind == "raw":
        return ExtractResult(0, 0)
    if kind == "zip":
        return _extract_zip(src, dest, max_bytes, max_members)
    return _extract_tar(src, dest, max_bytes, max_members)


def _extract_zip(src: Path, dest: Path, max_bytes: int, max_members: int) -> ExtractResult:
    written = total = 0
    try:
        with zipfile.ZipFile(src) as zf:
            members = zf.infolist()
            if len(members) > max_members:
                raise ArchiveError(
                    f"archive has {len(members)} members, over the {max_members} limit",
                    code="ingest.archive_too_many",
                    max=max_members,
                )

            declared = sum(m.file_size for m in members)
            if declared > max_bytes:
                raise ArchiveError(
                    f"archive expands to {declared // 1_048_576} MiB, "
                    f"over the {max_bytes // 1_048_576} MiB limit",
                    code="ingest.archive_too_large",
                    limitMib=max_bytes // 1_048_576,
                )

            for member in members:
                if member.is_dir():
                    continue
                target = _safe_target(dest, member.filename)
                if target is None:
                    raise ArchiveError(
                        f"unsafe path in archive: {member.filename!r}",
                        code="ingest.archive_unsafe",
                    )

                total += member.file_size
                if total > max_bytes:
                    raise ArchiveError(
                        "archive exceeded the uncompressed size limit while reading",
                        code="ingest.archive_too_large",
                    )

                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as fsrc, target.open("wb") as fdst:
                    while chunk := fsrc.read(1 << 20):
                        fdst.write(chunk)
                written += 1
    except zipfile.BadZipFile as exc:
        raise ArchiveError(f"corrupt zip: {exc}", code="ingest.archive_corrupt") from exc

    return ExtractResult(written, total)


def _extract_tar(src: Path, dest: Path, max_bytes: int, max_members: int) -> ExtractResult:
    written = total = 0
    try:
        with tarfile.open(src, "r:*") as tf:
            for count, member in enumerate(tf):
                if count >= max_members:
                    raise ArchiveError(
                        f"archive has over {max_members} members",
                        code="ingest.archive_too_many",
                        max=max_members,
                    )

                # Skip symlinks, hardlinks, devices, fifos — only regular files.
                if not member.isfile():
                    continue

                target = _safe_target(dest, member.name)
                if target is None:
                    raise ArchiveError(
                        f"unsafe path in archive: {member.name!r}",
                        code="ingest.archive_unsafe",
                    )

                total += member.size
                if total > max_bytes:
                    raise ArchiveError(
                        f"archive expands past the {max_bytes // 1_048_576} MiB limit",
                        code="ingest.archive_too_large",
                        limitMib=max_bytes // 1_048_576,
                    )

                fsrc = tf.extractfile(member)
                if fsrc is None:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with fsrc, target.open("wb") as fdst:
                    while chunk := fsrc.read(1 << 20):
                        fdst.write(chunk)
                written += 1
    except tarfile.TarError as exc:
        raise ArchiveError(f"corrupt tar: {exc}", code="ingest.archive_corrupt") from exc

    return ExtractResult(written, total)
