"""Path-component sanitization.

Every string that reaches the filesystem goes through here. Real DICOM is hostile to
naive foldering: the CT in our test data has StudyDescription "ABDO/PELVIS - " — an
embedded slash and a trailing space. Unsanitized, that silently creates a nested
directory. PersonName uses '^' as a component separator, and burned-CD archives carry
non-UTF-8 accents that zipfile mangles into CP437 mojibake.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

# Everything outside this set becomes '_'. Deliberately narrow: no spaces, no slashes,
# nothing a shell or a path parser could reinterpret.
_ALLOWED = re.compile(r"[^A-Za-z0-9._-]")
_RUNS = re.compile(r"_{2,}")

# UIDs are numeric-and-dot by definition (DICOM PS3.5 §9.1). Anything else is either
# corrupt or an injection attempt, and must never reach the filesystem.
_UID_RE = re.compile(r"^[0-9][0-9.]{0,63}$")

UNKNOWN = "UNKNOWN"


def slugify(value: str | None, maxlen: int = 64) -> str:
    """Reduce an arbitrary DICOM string to a safe path component."""
    if not value:
        return UNKNOWN

    # Decompose accents, then drop anything that will not survive ASCII. This also
    # absorbs the CP437 mojibake that zipfile produces for non-UTF-8 member names.
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")

    text = text.replace("^", " ")  # PersonName component separator
    text = _ALLOWED.sub("_", text.strip())
    text = _RUNS.sub("_", text)
    text = text.strip("._-")
    text = text[:maxlen].strip("._-")

    if not text:
        return UNKNOWN
    # A leading dot would create a hidden file; '.' and '..' would traverse.
    if text.startswith("."):
        text = "_" + text
    return text


def short_uid(uid: str) -> str:
    """A stable 8-char digest of a UID.

    Used as a directory suffix so two studies for the same patient, on the same date,
    with the same description still land in distinct directories. Hashing rather than
    truncating the UID because vendors routinely share UID suffixes.
    """
    return hashlib.sha1(uid.encode("utf-8"), usedforsecurity=False).hexdigest()[:8]


def is_valid_uid(uid: str | None) -> bool:
    return bool(uid) and bool(_UID_RE.match(str(uid)))


def user_slug(email: str, taken: set[str] | None = None) -> str:
    """Derive a filesystem slug from an email local-part, deduped against `taken`."""
    base = slugify(email.split("@", 1)[0], maxlen=32)
    if base == UNKNOWN:
        base = "user"
    base = base.lower()

    taken = taken or set()
    if base not in taken:
        return base
    for n in range(2, 1000):
        candidate = f"{base}-{n}"
        if candidate not in taken:
            return candidate
    raise ValueError(f"could not derive a unique slug for {email!r}")
