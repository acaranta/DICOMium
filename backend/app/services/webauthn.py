"""WebAuthn passkeys.

Passkeys here are *passwordless primary* credentials, not a second factor. Registration
therefore demands a discoverable (resident) credential, which is what lets the browser
offer an account without the user typing an email first. A passkey is already
multi-factor — possession of the device plus a biometric or PIN — so authenticating with
one is a complete sign-in.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import get_settings
from app.models import CHALLENGE_TTL_MINUTES, ChallengePurpose, Passkey, User, WebAuthnChallenge

log = logging.getLogger(__name__)


class WebAuthnError(RuntimeError):
    """Anything that should be reported to the user rather than 500'd."""


class InsecureContextError(WebAuthnError):
    """The origin is not HTTPS or localhost, so the browser will refuse regardless."""


@dataclass(frozen=True)
class RelyingParty:
    rp_id: str
    origin: str


def _is_secure_origin(scheme: str, hostname: str) -> bool:
    # Browsers permit WebAuthn only in a secure context. localhost is the one exception,
    # which is what makes local development possible at all.
    return scheme == "https" or hostname in ("localhost", "127.0.0.1", "::1")


def effective_origin(request) -> str | None:
    """The origin this request came from.

    Browsers only send an `Origin` header on cross-origin requests and on same-origin
    NON-GET requests. A same-origin GET — such as loading the account page's security
    status — carries none at all. So we fall back to Host plus the forwarded scheme, which
    is always present.

    (nginx sets X-Forwarded-Proto, so HTTPS behind the proxy is detected correctly even
    though uvicorn itself is speaking plain HTTP on the loopback.)
    """
    origin = request.headers.get("origin")
    if origin:
        return origin

    host = request.headers.get("host")
    if not host:
        return None

    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    # A comma-joined list can arrive through a chain of proxies; the first hop is the one
    # the browser actually spoke.
    scheme = scheme.split(",")[0].strip()
    return f"{scheme}://{host}"


def resolve_rp(origin_header: str | None) -> RelyingParty:
    """Work out the Relying Party ID and origin.

    Env overrides win. Otherwise both are derived from the request's origin, so the app
    works unchanged at http://localhost:8080 and behind a reverse proxy on any domain.

    Deriving from a header is safe here because the browser — not us — enforces that a
    credential's RP ID matches the page's real origin. A forged Origin or Host header
    cannot make a browser hand over a credential scoped to a different domain; the worst
    it can do is make the ceremony fail.
    """
    settings = get_settings()

    if settings.webauthn_rp_id and settings.webauthn_origin:
        return RelyingParty(settings.webauthn_rp_id, settings.webauthn_origin.rstrip("/"))

    if not origin_header:
        raise WebAuthnError(
            "Could not determine this instance's domain. "
            "Set WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN explicitly."
        )

    parsed = urlparse(origin_header)
    hostname = parsed.hostname or ""
    if not parsed.scheme or not hostname:
        raise WebAuthnError(f"Could not parse the origin {origin_header!r}")

    if not _is_secure_origin(parsed.scheme, hostname):
        raise InsecureContextError(
            f"Passkeys require HTTPS. This instance is being served over "
            f"{parsed.scheme}:// at {hostname}, where browsers refuse WebAuthn. "
            "Serve it over HTTPS, or use localhost. Password sign-in still works."
        )

    # The RP ID is the bare domain — no scheme, no port.
    rp_id = settings.webauthn_rp_id or hostname
    origin = settings.webauthn_origin.rstrip("/") if settings.webauthn_origin else origin_header.rstrip("/")
    return RelyingParty(rp_id, origin)


# ---- challenge storage -------------------------------------------------------
#
# Challenges live server-side rather than being round-tripped through the client, so the
# client cannot pick its own and replay a captured assertion.


async def _store_challenge(
    db: AsyncSession, challenge: bytes, purpose: ChallengePurpose, user_id: int | None
) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    db.add(
        WebAuthnChallenge(
            challenge=challenge,
            user_id=user_id,
            purpose=purpose.value,
            expires_at=now + timedelta(minutes=CHALLENGE_TTL_MINUTES),
            created_at=now,
        )
    )
    await db.commit()


async def _consume_challenge(
    db: AsyncSession, challenge: bytes, purpose: ChallengePurpose
) -> bool:
    """Take a challenge once. Returns False if it is unknown, expired, or already spent."""
    result = await db.execute(
        select(WebAuthnChallenge).where(
            WebAuthnChallenge.challenge == challenge,
            WebAuthnChallenge.purpose == purpose.value,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return False

    expired = row.expires_at < datetime.now(UTC).replace(tzinfo=None)
    await db.delete(row)  # one shot, whether or not it was still valid
    await db.commit()
    return not expired


async def sweep_challenges(db: AsyncSession) -> int:
    result = await db.execute(
        delete(WebAuthnChallenge).where(
            WebAuthnChallenge.expires_at < datetime.now(UTC).replace(tzinfo=None)
        )
    )
    await db.commit()
    return result.rowcount or 0


# ---- registration ------------------------------------------------------------


async def begin_registration(db: AsyncSession, user: User, origin_header: str | None) -> str:
    """Options JSON for navigator.credentials.create()."""
    settings = get_settings()
    rp = resolve_rp(origin_header)

    existing = await db.execute(select(Passkey).where(Passkey.user_id == user.id))
    exclude = [
        PublicKeyCredentialDescriptor(id=row.credential_id) for row in existing.scalars().all()
    ]

    options = generate_registration_options(
        rp_id=rp.rp_id,
        rp_name=settings.webauthn_rp_name,
        # A stable, non-guessable handle. NOT the email: the user handle is stored on the
        # authenticator and may be shown in the account picker.
        user_id=str(user.id).encode("utf-8"),
        user_name=user.email,
        user_display_name=user.email,
        # REQUIRED is what makes the credential discoverable, and discoverable is what
        # makes passwordless sign-in possible at all.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        # Stops the user registering the same authenticator twice.
        exclude_credentials=exclude,
    )

    await _store_challenge(db, options.challenge, ChallengePurpose.REGISTER, user.id)
    return options_to_json(options)


async def finish_registration(
    db: AsyncSession,
    user: User,
    credential: dict,
    origin_header: str | None,
    nickname: str,
) -> Passkey:
    rp = resolve_rp(origin_header)

    try:
        challenge = _challenge_from(credential)
    except (KeyError, ValueError) as exc:
        raise WebAuthnError("Malformed credential") from exc

    if not await _consume_challenge(db, challenge, ChallengePurpose.REGISTER):
        raise WebAuthnError("That registration has expired — please try again")

    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp.rp_id,
            expected_origin=rp.origin,
        )
    except InvalidRegistrationResponse as exc:
        log.warning("passkey registration rejected for %s: %s", user.email, exc)
        raise WebAuthnError(f"That passkey could not be registered: {exc}") from exc

    transports = credential.get("response", {}).get("transports") or []

    passkey = Passkey(
        user_id=user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=",".join(transports) if transports else None,
        aaguid=str(verified.aaguid) if verified.aaguid else None,
        backed_up=bool(verified.credential_backed_up),
        nickname=(nickname or "Passkey").strip()[:64] or "Passkey",
    )
    db.add(passkey)
    await db.commit()
    await db.refresh(passkey)

    log.info("registered passkey %r for %s (backed_up=%s)", passkey.nickname, user.email, passkey.backed_up)
    return passkey


# ---- authentication ----------------------------------------------------------


async def begin_authentication(db: AsyncSession, origin_header: str | None) -> str:
    """Options JSON for navigator.credentials.get(), with NO allow_credentials.

    Leaving allow_credentials empty is what makes this passwordless: the browser offers
    whichever discoverable credential it holds for this domain, so the user never types an
    email. It also means the server reveals nothing about which accounts exist.
    """
    rp = resolve_rp(origin_header)

    options = generate_authentication_options(
        rp_id=rp.rp_id,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    await _store_challenge(db, options.challenge, ChallengePurpose.AUTHENTICATE, None)
    return options_to_json(options)


async def finish_authentication(
    db: AsyncSession, credential: dict, origin_header: str | None
) -> User:
    rp = resolve_rp(origin_header)

    try:
        challenge = _challenge_from(credential)
        raw_id = _b64url_decode(credential["rawId"])
    except (KeyError, ValueError) as exc:
        raise WebAuthnError("Malformed credential") from exc

    if not await _consume_challenge(db, challenge, ChallengePurpose.AUTHENTICATE):
        raise WebAuthnError("That sign-in attempt has expired — please try again")

    result = await db.execute(select(Passkey).where(Passkey.credential_id == raw_id))
    passkey = result.scalar_one_or_none()
    if passkey is None:
        raise WebAuthnError("That passkey is not registered here")

    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp.rp_id,
            expected_origin=rp.origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
        )
    except InvalidAuthenticationResponse as exc:
        log.warning("passkey authentication rejected: %s", exc)
        raise WebAuthnError("That passkey could not be verified") from exc

    # Clone detection. Only meaningful when BOTH counters are non-zero: many authenticators
    # (iCloud Keychain among them) always report 0, and rejecting on that would lock out
    # most real users for no benefit.
    if passkey.sign_count > 0 and verified.new_sign_count > 0:
        if verified.new_sign_count <= passkey.sign_count:
            log.error(
                "sign counter regressed for passkey %s (stored=%d, got=%d) — possible clone",
                passkey.id, passkey.sign_count, verified.new_sign_count,
            )
            raise WebAuthnError(
                "This passkey may have been cloned and has been refused. "
                "Delete it and register a new one."
            )

    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = datetime.now(UTC).replace(tzinfo=None)

    user = await db.get(User, passkey.user_id)
    if user is None or not user.is_active:
        await db.commit()
        raise WebAuthnError("This account is disabled")

    await db.commit()
    return user


# ---- helpers -----------------------------------------------------------------


def _b64url_decode(value: str) -> bytes:
    import base64

    padding = "=" * (-len(value) % 4)  # the browser strips base64url padding
    return base64.urlsafe_b64decode(value + padding)


def _challenge_from(credential: dict) -> bytes:
    """Pull the challenge back out of clientDataJSON.

    We look it up in our own table straight after, so this is only a lookup key — the
    trust comes from py_webauthn re-verifying it against the signed clientDataJSON.
    """
    import json

    client_data = json.loads(_b64url_decode(credential["response"]["clientDataJSON"]))
    return _b64url_decode(client_data["challenge"])


def new_challenge() -> bytes:
    return secrets.token_bytes(32)
