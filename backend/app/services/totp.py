"""TOTP enrolment and verification (RFC 6238, 30-second steps, 6 digits)."""

from __future__ import annotations

import base64
import io
import logging
import time
from dataclasses import dataclass

import pyotp
import qrcode
from qrcode.image.pil import PilImage

from app.config import get_settings

log = logging.getLogger(__name__)

PERIOD = 30
DIGITS = 6

# Accept the adjacent steps as well as the current one, so a phone clock that is up to
# ~30s out still works. Wider than this materially weakens a 6-digit code.
VALID_WINDOW = 1


@dataclass(frozen=True)
class Enrolment:
    secret: str
    uri: str
    qr_data_url: str


def new_secret() -> str:
    return pyotp.random_base32()


def enrolment_for(secret: str, email: str) -> Enrolment:
    """Build everything the setup screen needs: the URI, a QR code, and the raw secret.

    The QR is rendered server-side as a data URL rather than shipping a QR library to the
    browser — Pillow is already a dependency for DICOM thumbnails, so this costs nothing.
    """
    settings = get_settings()
    uri = pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD).provisioning_uri(
        name=email, issuer_name=settings.totp_issuer
    )

    img: PilImage = qrcode.make(uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    return Enrolment(secret=secret, uri=uri, qr_data_url=f"data:image/png;base64,{encoded}")


def counter_now(at: float | None = None) -> int:
    return int((at if at is not None else time.time()) // PERIOD)


@dataclass(frozen=True)
class TotpResult:
    ok: bool
    counter: int = 0
    #: English, for logs and for clients that cannot translate.
    reason: str = ""
    #: The catalogue key for `reason`, so the browser can say it in the user's language.
    reason_code: str = ""


def verify(secret: str, code: str, last_counter: int, at: float | None = None) -> TotpResult:
    """Check a code and, on success, return the counter it belongs to.

    The caller MUST persist that counter. Verification alone is not enough: without
    recording which step was consumed, a code observed over someone's shoulder stays valid
    for the rest of its 30-second window and can simply be replayed. Rejecting any counter
    at or below the last accepted one closes that.
    """
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit() or len(code) != DIGITS:
        return TotpResult(False, reason="A code is 6 digits", reason_code="auth.code_length")

    now = at if at is not None else time.time()
    totp = pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD)

    # Find which step within the tolerance window this code belongs to, so we know what to
    # record. pyotp's verify() only answers yes/no and does not tell us.
    for offset in range(-VALID_WINDOW, VALID_WINDOW + 1):
        step_time = now + offset * PERIOD
        if not pyotp.utils.strings_equal(totp.at(step_time), code):
            continue

        counter = counter_now(step_time)
        if counter <= last_counter:
            return TotpResult(
                False,
                reason="That code has already been used",
                reason_code="auth.code_reused",
            )
        return TotpResult(True, counter=counter)

    return TotpResult(False, reason="Incorrect code", reason_code="auth.incorrect_code")
