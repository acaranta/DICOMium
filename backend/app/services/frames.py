"""Serving pixel frames over WADO-RS.

Files are stored byte-for-byte as uploaded, so this is where transfer syntax is reasoned
about — and nowhere else.

Passthrough is the default and the fast path: if Cornerstone can decode the syntax in a
web worker, hand it the exact stored bitstream. Zero server CPU, minimal bandwidth. Both
DVDs in dicomdata/ are Explicit VR LE, so they take this path uncompressed.

Transcode is the fallback for syntaxes Cornerstone cannot decode. It costs a decode per
frame, so it is not the default.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pydicom import dcmread
from pydicom.encaps import get_frame
from pydicom.uid import UID

from app.errors import CodedError

log = logging.getLogger(__name__)

EXPLICIT_VR_LE = "1.2.840.10008.1.2.1"
IMPLICIT_VR_LE = "1.2.840.10008.1.2"
OCTET_STREAM = "application/octet-stream"

# Syntaxes Cornerstone's wasm codecs handle natively. Anything here is passed straight
# through; anything else is transcoded.
CORNERSTONE_NATIVE: dict[str, str] = {
    IMPLICIT_VR_LE: OCTET_STREAM,
    EXPLICIT_VR_LE: OCTET_STREAM,
    "1.2.840.10008.1.2.1.99": OCTET_STREAM,  # deflated explicit VR LE
    "1.2.840.10008.1.2.2": OCTET_STREAM,  # explicit VR big endian (retired)
    "1.2.840.10008.1.2.5": "image/x-dicom-rle",  # RLE
    "1.2.840.10008.1.2.4.50": "image/jpeg",  # JPEG baseline
    "1.2.840.10008.1.2.4.51": "image/jpeg",  # JPEG extended
    "1.2.840.10008.1.2.4.57": "image/jll",  # JPEG lossless
    "1.2.840.10008.1.2.4.70": "image/jll",  # JPEG lossless SV1
    "1.2.840.10008.1.2.4.80": "image/jls",  # JPEG-LS lossless
    "1.2.840.10008.1.2.4.81": "image/jls",  # JPEG-LS near-lossless
    "1.2.840.10008.1.2.4.90": "image/jp2",  # JPEG 2000 lossless
    "1.2.840.10008.1.2.4.91": "image/jp2",  # JPEG 2000
    "1.2.840.10008.1.2.4.201": "image/jphc",  # HTJ2K
    "1.2.840.10008.1.2.4.202": "image/jphc",
    "1.2.840.10008.1.2.4.203": "image/jphc",
}

# Uncompressed syntaxes: PixelData is one flat buffer we can slice per frame.
UNCOMPRESSED = {IMPLICIT_VR_LE, EXPLICIT_VR_LE, "1.2.840.10008.1.2.1.99", "1.2.840.10008.1.2.2"}


class FrameError(CodedError):
    default_code = "frame.failed"


@dataclass
class FrameData:
    payload: bytes
    media_type: str
    transfer_syntax: str
    # True when we decoded server-side. The metadata route must then advertise the
    # post-decode photometric interpretation, not the stored one.
    transcoded: bool


def frame_count(path: Path) -> int:
    ds = dcmread(path, stop_before_pixels=True, force=True)
    return int(getattr(ds, "NumberOfFrames", 1) or 1)


def get_frames(path: Path, frame_numbers: list[int], mode: str = "auto") -> list[FrameData]:
    """Extract 1-based frames from a stored DICOM file."""
    ds = dcmread(path, force=True)

    transfer_syntax = IMPLICIT_VR_LE
    if ds.file_meta is not None:
        transfer_syntax = str(ds.file_meta.get("TransferSyntaxUID", IMPLICIT_VR_LE))

    total = int(getattr(ds, "NumberOfFrames", 1) or 1)
    for n in frame_numbers:
        if n < 1 or n > total:
            raise FrameError(
                f"frame {n} out of range (1..{total})",
                code="frame.out_of_range",
                frame=n,
                total=total,
            )

    native = transfer_syntax in CORNERSTONE_NATIVE
    passthrough = native and mode != "always"

    if passthrough:
        return [
            _passthrough(ds, transfer_syntax, n, total) for n in frame_numbers
        ]

    if mode == "never" and not native:
        raise FrameError(
            f"transfer syntax {transfer_syntax} needs transcoding but it is disabled",
            code="frame.transcode_disabled",
            transferSyntax=transfer_syntax,
        )

    return [_transcode(ds, n) for n in frame_numbers]


def _passthrough(ds, transfer_syntax: str, frame_number: int, total: int) -> FrameData:
    """Hand back the stored bitstream for one frame, untouched."""
    media_type = CORNERSTONE_NATIVE[transfer_syntax]
    pixel_data = ds.get("PixelData", None)
    if pixel_data is None:
        raise FrameError("instance has no PixelData", code="frame.no_pixel_data")

    if transfer_syntax in UNCOMPRESSED:
        # One flat buffer: slice out the frame.
        rows = int(ds.Rows)
        cols = int(ds.Columns)
        samples = int(getattr(ds, "SamplesPerPixel", 1) or 1)
        bits = int(getattr(ds, "BitsAllocated", 16) or 16)
        frame_bytes = rows * cols * samples * (bits // 8)

        start = (frame_number - 1) * frame_bytes
        payload = bytes(pixel_data[start : start + frame_bytes])
        if len(payload) != frame_bytes:
            raise FrameError(
                f"short frame: expected {frame_bytes} bytes, got {len(payload)}",
                code="frame.short",
            )
    else:
        # Encapsulated: pull the frame's compressed fragment(s).
        payload = bytes(
            get_frame(pixel_data, frame_number - 1, number_of_frames=total)
        )

    return FrameData(payload, media_type, transfer_syntax, transcoded=False)


def _transcode(ds, frame_number: int) -> FrameData:
    """Decode server-side and emit raw little-endian pixels."""
    try:
        arr = ds.pixel_array
    except Exception as exc:  # noqa: BLE001
        raise FrameError(
            f"cannot decode pixel data: {exc}", code="frame.undecodable"
        ) from exc

    total = int(getattr(ds, "NumberOfFrames", 1) or 1)
    if total > 1:
        arr = arr[frame_number - 1]

    # Do NOT apply modality or VOI LUT here: Cornerstone applies rescale and windowing
    # itself from the metadata. Applying them twice would double-transform the values
    # and quietly wreck every HU measurement.
    arr = np.ascontiguousarray(arr)
    if arr.dtype.byteorder == ">":
        arr = arr.astype(arr.dtype.newbyteorder("<"))

    return FrameData(
        payload=arr.tobytes(),
        media_type=OCTET_STREAM,
        transfer_syntax=EXPLICIT_VR_LE,
        transcoded=True,
    )


def effective_photometric(stored: str | None, transcoded: bool) -> str | None:
    """The photometric interpretation the client should believe.

    pydicom's JPEG decoder returns RGB for YBR_FULL_422 colour images, so a transcoded
    instance's stored value would lie to the client.
    """
    if not transcoded or not stored:
        return stored
    if stored.startswith("YBR"):
        return "RGB"
    return stored


def is_native(transfer_syntax: str) -> bool:
    return transfer_syntax in CORNERSTONE_NATIVE


def uid_name(transfer_syntax: str) -> str:
    try:
        return UID(transfer_syntax).name
    except Exception:  # noqa: BLE001
        return transfer_syntax
