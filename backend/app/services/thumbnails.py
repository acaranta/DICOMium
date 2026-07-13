"""Series thumbnail rendering.

Always best-effort: a series whose middle slice will not decode still imports fine and
simply shows a modality-letter placeholder in the UI. A thumbnail is never worth failing
an import over.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from PIL import Image
from pydicom import dcmread
from pydicom.pixels import apply_modality_lut, apply_voi_lut

log = logging.getLogger(__name__)


def render(dicom_path: Path, out_path: Path, size: int = 128) -> bool:
    """Render `dicom_path` to a PNG thumbnail. Returns False on any failure."""
    try:
        ds = dcmread(dicom_path)
        arr = ds.pixel_array

        # Multi-frame: take the middle frame, which is more representative than the first.
        if arr.ndim >= 3 and int(getattr(ds, "NumberOfFrames", 1) or 1) > 1:
            arr = arr[arr.shape[0] // 2]

        # Modality LUT maps stored values to real units (HU for CT); VOI LUT applies the
        # window the scanner recorded. Without both, a CT thumbnail is a grey smear.
        arr = apply_modality_lut(arr, ds)
        try:
            arr = apply_voi_lut(arr, ds, index=0)
        except (ValueError, IndexError, AttributeError):
            pass  # no VOI LUT in this file; the raw range still renders

        photometric = str(getattr(ds, "PhotometricInterpretation", "") or "")
        is_colour = arr.ndim == 3 and arr.shape[-1] in (3, 4)

        if is_colour:
            img = Image.fromarray(_to_uint8(arr[..., :3]), mode="RGB")
        else:
            arr = np.asarray(arr, dtype=np.float64)
            if photometric == "MONOCHROME1":
                arr = arr.max() - arr  # MONOCHROME1 is inverted by definition
            img = Image.fromarray(_to_uint8(arr), mode="L")

        img.thumbnail((size, size), Image.Resampling.LANCZOS)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path, format="PNG", optimize=True)
        return True

    except Exception as exc:  # noqa: BLE001 - never fatal
        log.warning("thumbnail failed for %s: %s", dicom_path.name, exc)
        return False


def _to_uint8(arr: np.ndarray) -> np.ndarray:
    """Normalize an arbitrary pixel array to displayable 8-bit."""
    arr = np.asarray(arr, dtype=np.float64)
    lo, hi = float(arr.min()), float(arr.max())
    if hi <= lo:
        return np.zeros(arr.shape, dtype=np.uint8)
    return (((arr - lo) / (hi - lo)) * 255.0).clip(0, 255).astype(np.uint8)
