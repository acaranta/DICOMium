"""Golden-bytes tests for the multipart/related frame body.

Cornerstone's extractMultipart() is a byte scanner, not a MIME parser. These tests pin
the exact bytes it depends on. A "cleanup" that adds a preamble, drops the part's
Content-Type, or omits the trailing CRLF would still look like valid MIME to a human and
would silently feed the browser garbage pixels.

The reimplementation of extractMultipart below mirrors the upstream algorithm, so if our
builder drifts from what the client actually does, these fail.
"""

from __future__ import annotations

from app.services.multipart import build, content_type_header

BOUNDARY = "0f3cf5c0b1e4aaaabbbbccccddddeeee"
PIXELS = b"\x00\x01\x02\x03\xff\xfe"


class TestBodyShape:
    def test_opens_directly_on_the_boundary_with_no_preamble(self):
        body = build([PIXELS], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        # extractMultipart scans for the FIRST line starting with '--'. A preamble would
        # make it mis-detect the boundary.
        assert body.startswith(f"--{BOUNDARY}\r\n".encode())

    def test_part_carries_a_content_type_header_line(self):
        body = build([PIXELS], BOUNDARY, "image/jls", "1.2.840.10008.1.2.4.80")
        assert b"\r\nContent-Type: image/jls; transfer-syntax=1.2.840.10008.1.2.4.80\r\n" in body

    def test_payload_is_crlf_terminated_before_the_closing_boundary(self):
        body = build([PIXELS], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        assert body.endswith(PIXELS + b"\r\n" + f"--{BOUNDARY}--\r\n".encode())

    def test_blank_line_separates_headers_from_payload(self):
        body = build([PIXELS], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        head, _, tail = body.partition(b"\r\n\r\n")
        assert b"Content-Type:" in head
        assert tail.startswith(PIXELS)

    def test_exact_golden_bytes(self):
        body = build(
            [PIXELS],
            BOUNDARY,
            "application/octet-stream",
            "1.2.840.10008.1.2.1",
            content_locations=["/dicomweb/x/frames/1"],
        )
        expected = (
            f"--{BOUNDARY}\r\n".encode()
            + b"Content-Type: application/octet-stream; transfer-syntax=1.2.840.10008.1.2.1\r\n"
            + b"Content-Location: /dicomweb/x/frames/1\r\n"
            + b"\r\n"
            + PIXELS
            + b"\r\n"
            + f"--{BOUNDARY}--\r\n".encode()
        )
        assert body == expected


class TestResponseHeader:
    def test_declares_type_and_transfer_syntax_and_boundary(self):
        header = content_type_header(BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        assert header == (
            'multipart/related; type="application/octet-stream"; '
            f"transfer-syntax=1.2.840.10008.1.2.1; boundary={BOUNDARY}"
        )


def _extract_multipart(content_type: str, body: bytes) -> list[bytes]:
    """A faithful port of Cornerstone's extractMultipart byte scanner."""
    if "multipart" not in content_type:
        return [body]  # upstream accepts a non-multipart body as the raw payload

    # Find the boundary: the first line starting with '--'.
    header_end = body.find(b"\r\n\r\n")
    assert header_end != -1, "no blank line ending the part headers"
    head = body[:header_end]

    boundary = None
    for line in head.split(b"\r\n"):
        if line.startswith(b"--"):
            boundary = line
            break
    assert boundary is not None, "no boundary line found"

    # The part must declare its own Content-Type.
    assert any(line.startswith(b"Content-Type:") for line in head.split(b"\r\n"))

    payload_start = header_end + 4
    payload_end = body.find(boundary, payload_start)
    assert payload_end != -1, "closing boundary not found"
    return [body[payload_start : payload_end - 2]]  # -2 drops the trailing CRLF


class TestAgainstTheRealClientAlgorithm:
    def test_client_recovers_the_exact_pixels(self):
        body = build([PIXELS], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        header = content_type_header(BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        assert _extract_multipart(header, body)[0] == PIXELS

    def test_client_recovers_pixels_containing_boundary_like_bytes(self):
        # Pixel data that happens to contain '--' must not confuse the scanner, because
        # it only looks for the boundary AFTER the payload starts.
        tricky = b"\x2d\x2d\x00\xff--not-a-boundary\r\n\x01"
        body = build([tricky], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        header = content_type_header(BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        assert _extract_multipart(header, body)[0] == tricky

    def test_client_recovers_binary_pixels_with_embedded_crlfcrlf(self):
        # A blank line inside the pixel data must not be mistaken for the header break,
        # because the scanner takes the FIRST one, which is ours.
        tricky = b"\xff\xd8\r\n\r\n\x00\x10"
        body = build([tricky], BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        header = content_type_header(BOUNDARY, "application/octet-stream", "1.2.840.10008.1.2.1")
        assert _extract_multipart(header, body)[0] == tricky
