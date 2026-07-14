"""Registration, login (with the MFA step), logout, identity."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import func, select

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.models import (
    MFA_COOKIE,
    PENDING_LOGIN_TTL_MINUTES,
    SESSION_COOKIE,
    TotpCredential,
    User,
)
from app.schemas.account import LoginResult, MfaVerifyRequest, PasskeyLoginRequest
from app.schemas.auth import AuthConfigOut, LoginRequest, RegisterRequest, UserOut
from app.services import avatar, crypto, recovery, totp
from app.services import webauthn as webauthn_svc
from app.services.auth import (
    create_pending_login,
    create_session,
    destroy_pending_login,
    destroy_session,
    hash_password,
    record_failed_mfa,
    resolve_pending_login,
    totp_enabled,
    verify_password,
)
from app.services.slug import user_slug

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _user_count(db: DbSession) -> int:
    return (await db.execute(select(func.count(User.id)))).scalar_one()


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


def _set_mfa_cookie(response: Response, token: str) -> None:
    """The half-authenticated cookie. Short-lived, and NOT the session cookie."""
    settings = get_settings()
    response.set_cookie(
        key=MFA_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=PENDING_LOGIN_TTL_MINUTES * 60,
        path="/",
    )


async def _user_out(db: DbSession, user: User) -> UserOut:
    """UserOut with the avatar settings attached (materialising defaults on first access)."""
    prefs = await avatar.preferences_for(db, user)
    return UserOut.with_prefs(user, prefs, avatar.gravatar_hash(user.email))


async def _sign_in(db: DbSession, user: User, request: Request, response: Response) -> UserOut:
    """Mint the real session. The single place a session is created."""
    session = await create_session(
        db,
        user,
        request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    _set_session_cookie(response, session.token)
    response.delete_cookie(MFA_COOKIE, path="/")
    return await _user_out(db, user)


@router.get("/config", response_model=AuthConfigOut)
async def auth_config(db: DbSession) -> AuthConfigOut:
    settings = get_settings()
    return AuthConfigOut(
        registration_enabled=settings.registration_enabled,
        has_users=await _user_count(db) > 0,
        min_password_length=settings.min_password_length,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, response: Response, db: DbSession):
    settings = get_settings()
    count = await _user_count(db)

    # A zero-user instance is always claimable, so deploying with registration off
    # cannot brick a fresh install.
    if not settings.registration_enabled and count > 0:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is disabled")

    email = body.email.lower().strip()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered")

    taken = set((await db.execute(select(User.slug))).scalars().all())
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        slug=user_slug(email, taken),
        is_admin=count == 0,  # first user in gets the keys
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    log.info("registered user %s (slug=%s, admin=%s)", user.email, user.slug, user.is_admin)
    return await _sign_in(db, user, request, response)


@router.post("/login", response_model=LoginResult)
async def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Same error for "no such user" and "wrong password" — do not leak which.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled")

    # The password was right, but it is not enough. Hand back only the short-lived MFA
    # cookie — no session exists yet, so nothing is reachable until the code lands.
    if await totp_enabled(db, user.id):
        pending = await create_pending_login(db, user)
        _set_mfa_cookie(response, pending.token)
        return LoginResult(mfa_required=True, methods=["totp", "recovery"])

    return LoginResult(user=await _sign_in(db, user, request, response))


@router.post("/login/mfa", response_model=LoginResult)
async def login_mfa(
    body: MfaVerifyRequest,
    request: Request,
    response: Response,
    db: DbSession,
    dicomium_mfa: Annotated[str | None, Cookie(alias=MFA_COOKIE)] = None,
):
    """The second factor. Accepts a TOTP code or a recovery code."""
    pending = await resolve_pending_login(db, dicomium_mfa)
    if pending is None:
        response.delete_cookie(MFA_COOKIE, path="/")
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "That sign-in has expired — please start again"
        )

    user = await db.get(User, pending.user_id)
    if user is None or not user.is_active:
        await destroy_pending_login(db, dicomium_mfa)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled")

    credential = await _totp_row(db, user.id)
    if credential is None:
        await destroy_pending_login(db, dicomium_mfa)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No second factor is enrolled")

    code = body.code.strip()

    # A 6-digit string is a TOTP code; anything else is treated as a recovery code. This
    # lets the user paste either into one box.
    if code.isdigit() and len(code) == totp.DIGITS:
        secret = crypto.decrypt(credential.secret_encrypted)
        outcome = totp.verify(secret, code, credential.last_counter)
        if outcome.ok:
            # Burn the counter, or the code stays replayable for the rest of its window.
            credential.last_counter = outcome.counter
            await db.commit()
            await destroy_pending_login(db, dicomium_mfa)
            return LoginResult(user=await _sign_in(db, user, request, response))
        reason = outcome.reason
    else:
        if await recovery.consume(db, user, code):
            await destroy_pending_login(db, dicomium_mfa)
            log.info("%s signed in with a recovery code", user.email)
            return LoginResult(user=await _sign_in(db, user, request, response))
        reason = "Incorrect code"

    attempts = await record_failed_mfa(db, pending)
    if attempts >= 5:
        response.delete_cookie(MFA_COOKIE, path="/")
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many incorrect codes — please sign in again",
        )
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, reason)


async def _totp_row(db: DbSession, user_id: int) -> TotpCredential | None:
    result = await db.execute(
        select(TotpCredential).where(
            TotpCredential.user_id == user_id,
            TotpCredential.confirmed_at.is_not(None),
        )
    )
    return result.scalar_one_or_none()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    dicomium_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    dicomium_mfa: Annotated[str | None, Cookie(alias=MFA_COOKIE)] = None,
) -> None:
    await destroy_session(db, dicomium_session)
    await destroy_pending_login(db, dicomium_mfa)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(MFA_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, db: DbSession) -> UserOut:
    return await _user_out(db, user)


# ---- passwordless passkey sign-in --------------------------------------------
#
# Unauthenticated by design. A passkey IS multi-factor — possession of the device plus a
# biometric or PIN — so a verified assertion is a complete sign-in. It deliberately does
# NOT then ask for a TOTP code: stacking a second factor on top of a second factor is
# theatre, and the user would just turn one of them off.


@router.post("/passkeys/login/begin")
async def passkey_login_begin(request: Request, db: DbSession) -> Response:
    """Options for navigator.credentials.get(). No email is required or accepted."""
    try:
        options = await webauthn_svc.begin_authentication(db, webauthn_svc.effective_origin(request))
    except webauthn_svc.WebAuthnError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    # options_to_json already returns a JSON string; re-encoding it would double it.
    return Response(content=options, media_type="application/json")


@router.post("/passkeys/login/complete", response_model=LoginResult)
async def passkey_login_complete(
    body: PasskeyLoginRequest, request: Request, response: Response, db: DbSession
):
    try:
        user = await webauthn_svc.finish_authentication(
            db, body.credential, webauthn_svc.effective_origin(request)
        )
    except webauthn_svc.WebAuthnError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    log.info("%s signed in with a passkey", user.email)
    return LoginResult(user=await _sign_in(db, user, request, response))
