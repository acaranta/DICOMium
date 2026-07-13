"""Deciding whether a series can become an MPR volume.

Cornerstone's streaming volume loader throws on irregular geometry. Discovering that in
the browser means a white screen, so we decide it once at ingest and gate the MPR button
on the answer.

The subtlety, learned from the CT in dicomdata/: a series is not always one clean stack.
GE reformat series ("AP Sans Ax", 255 slices) embed a handful of off-plane reference
images among the reformatted ones. Rejecting the whole series for that would lose MPR on
a perfectly good volume.

So we group the slices by orientation, take the dominant group, and ask whether *that*
forms a regular stack. The stack viewer still shows every image in the series; only MPR
restricts itself to the dominant group.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass

log = logging.getLogger(__name__)

MIN_SLICES = 3
# Orientation cosines are grouped on a rounded key. 3 decimals ~= 0.06 degrees, far
# tighter than any real acquisition jitter, but loose enough to absorb float noise.
ORIENTATION_PRECISION = 3
# Real scanners jitter slice positions slightly. Allow 1% of the median spacing, with a
# 0.01mm floor so very thin slices are not held to an unreachable absolute tolerance.
SPACING_RELATIVE_TOLERANCE = 0.01
SPACING_ABSOLUTE_FLOOR = 0.01


@dataclass
class SliceInfo:
    """The subset of an instance the geometry check needs."""

    image_position_patient: str | None
    image_orientation_patient: str | None
    pixel_spacing: str | None
    rows: int | None
    columns: int | None
    number_of_frames: int = 1


@dataclass
class SeriesGeometry:
    is_reconstructable: bool
    slice_spacing: float | None = None
    # The orientation of the dominant group, as a csv IOP. MPR loads only the instances
    # matching this; None means "every instance in the series".
    mpr_orientation: str | None = None
    mpr_instance_count: int = 0
    reason: str = ""


def _parse(csv: str | None) -> list[float] | None:
    if not csv:
        return None
    try:
        return [float(x) for x in csv.split(",")]
    except ValueError:
        return None


def _cross(a: list[float], b: list[float]) -> list[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def _orientation_key(iop: list[float]) -> tuple:
    return tuple(round(v, ORIENTATION_PRECISION) for v in iop)


def analyze(slices: list[SliceInfo]) -> SeriesGeometry:
    """Decide reconstructability, and identify which slices form the volume."""
    # An enhanced multi-frame instance carries the whole volume in one file. The loader
    # reads its per-frame functional groups itself; we do not second-guess it here.
    if len(slices) == 1 and slices[0].number_of_frames >= MIN_SLICES:
        return SeriesGeometry(True, None, None, 1, "multiframe volume")

    if len(slices) < MIN_SLICES:
        return SeriesGeometry(False, reason=f"only {len(slices)} slice(s)")

    # Group by orientation. The largest group is the acquisition; the rest are embedded
    # scouts, reference images, or a second stack.
    groups: dict[tuple, list[SliceInfo]] = defaultdict(list)
    for s in slices:
        iop = _parse(s.image_orientation_patient)
        if iop is None or len(iop) != 6:
            continue
        groups[_orientation_key(iop)].append(s)

    if not groups:
        return SeriesGeometry(False, reason="no ImageOrientationPatient")

    key, group = max(groups.items(), key=lambda kv: len(kv[1]))
    orientation = _parse(group[0].image_orientation_patient)
    assert orientation is not None

    if len(group) < MIN_SLICES:
        return SeriesGeometry(
            False, reason=f"largest orientation group has only {len(group)} slice(s)"
        )

    result = _check_stack(group, orientation)
    if not result.is_reconstructable:
        return result

    outliers = len(slices) - len(group)
    reason = "regular stack"
    if outliers:
        reason = f"regular stack of {len(group)} ({outliers} off-plane image(s) excluded)"

    return SeriesGeometry(
        is_reconstructable=True,
        slice_spacing=result.slice_spacing,
        mpr_orientation=",".join(str(v) for v in orientation) if outliers else None,
        mpr_instance_count=len(group),
        reason=reason,
    )


def _check_stack(group: list[SliceInfo], orientation: list[float]) -> SeriesGeometry:
    """Is this single-orientation group an evenly spaced stack?"""
    first = group[0]

    for s in group:
        if s.rows != first.rows or s.columns != first.columns:
            return SeriesGeometry(False, reason="mixed image sizes")
        if s.pixel_spacing != first.pixel_spacing:
            return SeriesGeometry(False, reason="mixed pixel spacing")

    # Project each position onto the slice normal, then check the gaps are even.
    normal = _cross(orientation[:3], orientation[3:])
    projections: list[float] = []
    for s in group:
        pos = _parse(s.image_position_patient)
        if pos is None or len(pos) != 3:
            return SeriesGeometry(False, reason="a slice is missing ImagePositionPatient")
        projections.append(sum(p * n for p, n in zip(pos, normal)))

    projections.sort()
    gaps = [b - a for a, b in zip(projections, projections[1:])]
    if not gaps or any(g <= 0 for g in gaps):
        return SeriesGeometry(False, reason="duplicate or non-monotone slice positions")

    ordered = sorted(gaps)
    median = ordered[len(ordered) // 2]
    tolerance = max(median * SPACING_RELATIVE_TOLERANCE, SPACING_ABSOLUTE_FLOOR)
    if any(abs(g - median) > tolerance for g in gaps):
        return SeriesGeometry(False, slice_spacing=median, reason="uneven slice spacing")

    return SeriesGeometry(True, slice_spacing=median, mpr_instance_count=len(group))
