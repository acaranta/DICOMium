"""Geometry / MPR-gating tests.

The embedded-scout case is drawn from the real CT in dicomdata/: series 601 is 255
axial reformat slices with a handful of coronal reference images mixed in.
"""

from __future__ import annotations

from app.services.geometry import SliceInfo, analyze

AXIAL = "1.0,0.0,0.0,0.0,1.0,0.0"
CORONAL = "1.0,0.0,0.0,0.0,0.0,-1.0"
SAGITTAL = "0.0,1.0,0.0,0.0,0.0,-1.0"


def _normal(iop: str) -> tuple[float, float, float]:
    r = [float(x) for x in iop.split(",")]
    a, b = r[:3], r[3:]
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _stack(n: int, spacing: float = 1.25, iop: str = AXIAL, start: float = 0.0) -> list[SliceInfo]:
    """Build a regular stack, stepping along the slice normal for the given orientation.

    Stepping along a fixed axis would be wrong: a sagittal stack advances in X, not Z.
    """
    nx, ny, nz = _normal(iop)
    origin = (-100.0, -100.0, -100.0)
    slices = []
    for i in range(n):
        offset = start + i * spacing
        pos = (origin[0] + nx * offset, origin[1] + ny * offset, origin[2] + nz * offset)
        slices.append(
            SliceInfo(
                image_position_patient=",".join(str(round(p, 4)) for p in pos),
                image_orientation_patient=iop,
                pixel_spacing="0.7,0.7",
                rows=512,
                columns=512,
            )
        )
    return slices


class TestRegularStacks:
    def test_clean_axial_stack_is_reconstructable(self):
        geo = analyze(_stack(406))
        assert geo.is_reconstructable
        assert geo.slice_spacing == 1.25
        assert geo.mpr_instance_count == 406
        # No outliers, so MPR uses every instance.
        assert geo.mpr_orientation is None

    def test_multiframe_instance_is_a_volume(self):
        multiframe = [
            SliceInfo(None, None, None, 512, 512, number_of_frames=120),
        ]
        assert analyze(multiframe).is_reconstructable


class TestEmbeddedReferenceImages:
    def test_dominant_group_wins_over_embedded_scouts(self):
        # 255 axial slices + 3 coronal reference images, as GE actually ships them.
        slices = _stack(255, iop=AXIAL) + _stack(3, iop=CORONAL, spacing=50.0)
        geo = analyze(slices)

        assert geo.is_reconstructable
        assert geo.mpr_instance_count == 255
        # MPR must filter to the dominant orientation, or volume creation fails.
        assert geo.mpr_orientation == AXIAL
        assert "off-plane" in geo.reason

    def test_sagittal_reformat_with_coronal_references(self):
        slices = _stack(245, iop=SAGITTAL) + _stack(2, iop=CORONAL, spacing=50.0)
        geo = analyze(slices)
        assert geo.is_reconstructable
        assert geo.mpr_orientation == SAGITTAL
        assert geo.mpr_instance_count == 245

    def test_dominant_group_too_small_is_rejected(self):
        # A genuine mixed bag with no real stack in it.
        slices = _stack(2, iop=AXIAL) + _stack(2, iop=CORONAL) + _stack(2, iop=SAGITTAL)
        assert not analyze(slices).is_reconstructable


class TestRejections:
    def test_two_slice_localizer(self):
        geo = analyze(_stack(2))
        assert not geo.is_reconstructable
        assert "2 slice" in geo.reason

    def test_single_image(self):
        assert not analyze(_stack(1)).is_reconstructable

    def test_uneven_spacing(self):
        slices = _stack(5)
        # Shove one slice well off the grid.
        slices[3] = SliceInfo("-100.0,-100.0,99.0", AXIAL, "0.7,0.7", 512, 512)
        geo = analyze(slices)
        assert not geo.is_reconstructable
        assert "uneven" in geo.reason

    def test_mixed_image_sizes(self):
        slices = _stack(5)
        slices[2] = SliceInfo("-100.0,-100.0,2.5", AXIAL, "0.7,0.7", 256, 256)
        geo = analyze(slices)
        assert not geo.is_reconstructable
        assert "mixed image sizes" in geo.reason

    def test_duplicate_positions(self):
        slices = _stack(4)
        slices[2] = slices[1]
        geo = analyze(slices)
        assert not geo.is_reconstructable
        assert "duplicate" in geo.reason

    def test_missing_orientation(self):
        slices = [SliceInfo("-100.0,-100.0,0.0", None, "0.7,0.7", 512, 512) for _ in range(5)]
        geo = analyze(slices)
        assert not geo.is_reconstructable
        assert "no ImageOrientationPatient" in geo.reason
