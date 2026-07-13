"""multipart/related body builder for WADO-RS frame responses.

Cornerstone's extractMultipart() is a hand-rolled byte scanner, not a MIME parser. It:
  * finds the boundary by scanning for the FIRST line starting with '--'
  * finds the part's content type by scanning for the FIRST line starting with
    'Content-Type:'
  * slices the payload from the first blank line (+4 bytes) to the closing boundary
    minus 2 bytes

So the body must have NO preamble, every part MUST carry a real Content-Type header
line, and the payload MUST be followed by CRLF before the closing boundary. Get any of
these wrong and the browser silently decodes garbage.

test_multipart.py pins the exact bytes.
"""

from __future__ import annotations

import secrets

CRLF = b"\r\n"


def make_boundary() -> str:
    return secrets.token_hex(16)


def content_type_header(boundary: str, media_type: str, transfer_syntax: str | None) -> str:
    """The response-level Content-Type."""
    header = f'multipart/related; type="{media_type}"'
    if transfer_syntax:
        header += f"; transfer-syntax={transfer_syntax}"
    return f"{header}; boundary={boundary}"


def build(
    parts: list[bytes],
    boundary: str,
    media_type: str,
    transfer_syntax: str | None = None,
    content_locations: list[str] | None = None,
) -> bytes:
    """Assemble the multipart/related body."""
    part_type = media_type
    if transfer_syntax:
        part_type = f"{media_type}; transfer-syntax={transfer_syntax}"

    delimiter = f"--{boundary}".encode("ascii")
    chunks: list[bytes] = []

    for index, payload in enumerate(parts):
        # No preamble: the body opens directly on the boundary.
        chunks.append(delimiter + CRLF)
        chunks.append(b"Content-Type: " + part_type.encode("ascii") + CRLF)
        if content_locations and index < len(content_locations):
            chunks.append(
                b"Content-Location: " + content_locations[index].encode("ascii") + CRLF
            )
        chunks.append(CRLF)  # blank line ends the part headers
        chunks.append(payload)
        chunks.append(CRLF)  # payload must be CRLF-terminated before the next boundary

    chunks.append(delimiter + b"--" + CRLF)
    return b"".join(chunks)
