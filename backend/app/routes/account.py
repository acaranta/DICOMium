"""Account security: passkeys, TOTP enrolment, recovery codes.

Everything here is authenticated. Destructive changes (disabling TOTP, deleting a passkey,
regenerating recovery codes) additionally require the password again — otherwise a stolen
session could quietly strip MFA off the account, which would make MFA pointless the moment
a session leaks.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, select

from app.dependencies import CurrentUser, DbSession
from app.models import Passkey, RecoveryCode, TotpCredential, User
from app.schemas.account import (
    PasskeyOut,
    PasskeyRegisterRequest,
    PasskeyRenameRequest,
    PasswordConfirmRequest,
    RecoveryCodesOut,
    SecurityStatusOut,
    TotpBeginOut,
    TotpConfirmRequest,
)
from app.services import crypto, recovery, totp
from app.services import webauthn as webauthn_svc
from app.services.auth import totp_enabled, verify_password

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/account", tags=["account"])


def _require_password(user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@router.get("/security", response_model=SecurityStatusOut)
async def security_status(user: CurrentUser, db: DbSession, request: Request):
    result = await db.execute(
        select(Passkey).where(Passkey.user_id == user.id).order_by(Passkey.created_at)
    )
    passkeys = [PasskeyOut.from_row(p) for p in result.scalars().all()]

    # Tell the UI up front whether passkeys can work here at all, rather than letting the
    # browser throw an opaque DOM exception when the user clicks the button.
    supported, reason = True, ""
    try:
        webauthn_svc.resolve_rp(webauthn_svc.effective_origin(request))
    except webauthn_svc.WebAuthnError as exc:
        supported, reason = False, str(exc)

    return SecurityStatusOut(
        totp_enabled=await totp_enabled(db, user.id),
        passkeys=passkeys,
        recovery_codes_remaining=await recovery.remaining(db, user.id),
        passkeys_supported=supported,
        passkeys_unsupported_reason=reason,
    )


# ---- passkeys ----------------------------------------------------------------


@router.post("/passkeys/register/begin")
async def passkey_register_begin(user: CurrentUser, db: DbSession, request: Request) -> Response:
    try:
        options = await webauthn_svc.begin_registration(db, user, webauthn_svc.effective_origin(request))
    except webauthn_svc.WebAuthnError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return Response(content=options, media_type="application/json")


@router.post("/passkeys/register/complete", response_model=PasskeyOut, status_code=201)
async def passkey_register_complete(
    body: PasskeyRegisterRequest, user: CurrentUser, db: DbSession, request: Request
):
    try:
        passkey = await webauthn_svc.finish_registration(
            db, user, body.credential, webauthn_svc.effective_origin(request), body.nickname
        )
    except webauthn_svc.WebAuthnError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return PasskeyOut.from_row(passkey)


@router.patch("/passkeys/{passkey_id}", response_model=PasskeyOut)
async def rename_passkey(
    passkey_id: int, body: PasskeyRenameRequest, user: CurrentUser, db: DbSession
):
    passkey = await _owned_passkey(db, passkey_id, user.id)
    passkey.nickname = body.nickname.strip()[:64]
    await db.commit()
    await db.refresh(passkey)
    return PasskeyOut.from_row(passkey)


@router.post("/passkeys/{passkey_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passkey(
    passkey_id: int, body: PasswordConfirmRequest, user: CurrentUser, db: DbSession
) -> None:
    # POST-with-body rather than DELETE: this needs the password, and a DELETE body is
    # poorly supported by intermediaries.
    _require_password(user, body.password)

    passkey = await _owned_passkey(db, passkey_id, user.id)
    await db.delete(passkey)
    await db.commit()
    log.info("%s deleted passkey %r", user.email, passkey.nickname)


async def _owned_passkey(db: DbSession, passkey_id: int, user_id: int) -> Passkey:
    result = await db.execute(
        select(Passkey).where(Passkey.id == passkey_id, Passkey.user_id == user_id)
    )
    passkey = result.scalar_one_or_none()
    if passkey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such passkey")
    return passkey


# ---- TOTP --------------------------------------------------------------------


@router.post("/totp/begin", response_model=TotpBeginOut)
async def totp_begin(user: CurrentUser, db: DbSession):
    """Start enrolment: mint a secret, return a QR to scan.

    The row is created UNCONFIRMED. It does not gate anything until the user proves they
    scanned it by entering a live code, so an abandoned setup cannot lock them out.
    """
    if await totp_enabled(db, user.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An authenticator is already set up. Remove it first to enrol a new one.",
        )

    # Any previous unconfirmed attempt is stale.
    await db.execute(delete(TotpCredential).where(TotpCredential.user_id == user.id))

    secret = totp.new_secret()
    db.add(
        TotpCredential(
            user_id=user.id,
            secret_encrypted=crypto.encrypt(secret),
            confirmed_at=None,
        )
    )
    await db.commit()

    enrolment = totp.enrolment_for(secret, user.email)
    return TotpBeginOut(
        secret=enrolment.secret, uri=enrolment.uri, qr_data_url=enrolment.qr_data_url
    )


@router.post("/totp/confirm", response_model=RecoveryCodesOut)
async def totp_confirm(body: TotpConfirmRequest, user: CurrentUser, db: DbSession):
    """Prove the QR was scanned, then hand over the recovery codes — once."""
    result = await db.execute(select(TotpCredential).where(TotpCredential.user_id == user.id))
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start the setup first")
    if credential.confirmed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This authenticator is already confirmed")

    secret = crypto.decrypt(credential.secret_encrypted)
    outcome = totp.verify(secret, body.code, credential.last_counter)
    if not outcome.ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, outcome.reason)

    credential.confirmed_at = _now()
    credential.last_counter = outcome.counter
    await db.commit()

    log.info("%s enabled TOTP", user.email)
    # Issuing the codes here, at the moment MFA becomes real, is the only point where the
    # user is guaranteed to be looking.
    return RecoveryCodesOut(codes=await recovery.generate(db, user))


@router.post("/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
async def totp_disable(body: PasswordConfirmRequest, user: CurrentUser, db: DbSession) -> None:
    _require_password(user, body.password)

    await db.execute(delete(TotpCredential).where(TotpCredential.user_id == user.id))
    # The codes exist to recover a second factor. With no second factor they are just
    # extra passwords, so they go too.
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    await db.commit()
    log.info("%s disabled TOTP", user.email)


# ---- recovery codes ----------------------------------------------------------


@router.post("/recovery-codes", response_model=RecoveryCodesOut)
async def regenerate_recovery_codes(
    body: PasswordConfirmRequest, user: CurrentUser, db: DbSession
):
    _require_password(user, body.password)

    if not await totp_enabled(db, user.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Recovery codes exist to recover an authenticator. Set one up first.",
        )

    return RecoveryCodesOut(codes=await recovery.generate(db, user))
