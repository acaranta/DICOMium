"""The login gate.

The single most important property here: while a user owes a second factor, they must hold
NO session. Not a flagged session, not a restricted session — none. These tests assert that
directly, by trying to reach a protected route from the half-authenticated state.
"""

from __future__ import annotations

import time

import pyotp
import pytest
from sqlalchemy import select

from app.models import MFA_COOKIE, SESSION_COOKIE, TotpCredential
from app.services import crypto
from app.services.totp import DIGITS, PERIOD

PASSWORD = "correct-horse-battery"
EMAIL = "arthur@example.com"


def code_now(secret: str) -> str:
    return pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD).now()


def fresh_code(secret: str) -> str:
    """A code from the NEXT 30-second step.

    Enrolment consumes the current step's code (that is the replay guard working), so a
    test that immediately reuses it would be refused — correctly. A real user enrols and
    then signs in later with a new code. The next step is still inside the +1 drift window,
    so the server accepts it, and its counter is ahead of the burned one.
    """
    return pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD).at(time.time() + PERIOD)


async def register(client) -> None:
    res = await client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert res.status_code == 201


async def enable_totp(client, db) -> str:
    """Run the real enrolment flow and return the secret."""
    begin = await client.post("/api/account/totp/begin")
    assert begin.status_code == 200
    secret = begin.json()["secret"]

    confirm = await client.post("/api/account/totp/confirm", json={"code": code_now(secret)})
    assert confirm.status_code == 200, confirm.text

    codes = confirm.json()["codes"]
    assert len(codes) == 10
    return secret


class TestPasswordOnlyIsUnchanged:
    async def test_login_without_totp_signs_straight_in(self, client):
        await register(client)
        await client.post("/api/auth/logout")

        res = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert res.status_code == 200

        body = res.json()
        assert body["mfa_required"] is False
        assert body["user"]["email"] == EMAIL
        assert SESSION_COOKIE in res.cookies

        assert (await client.get("/api/auth/me")).status_code == 200

    async def test_wrong_password_still_401s(self, client):
        await register(client)
        await client.post("/api/auth/logout")

        res = await client.post("/api/auth/login", json={"email": EMAIL, "password": "wrong-wrong-wrong"})
        assert res.status_code == 401


class TestTotpGate:
    async def test_password_alone_yields_no_session(self, client, db):
        await register(client)
        await enable_totp(client, db)
        await client.post("/api/auth/logout")

        res = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert res.status_code == 200

        body = res.json()
        assert body["mfa_required"] is True
        assert body["user"] is None
        assert set(body["methods"]) == {"totp", "recovery"}

        # The crux: a correct password hands back ONLY the short-lived MFA cookie.
        assert MFA_COOKIE in res.cookies
        assert SESSION_COOKIE not in res.cookies

        # And it opens nothing. If this ever returns 200, the whole feature is decorative.
        assert (await client.get("/api/auth/me")).status_code == 401
        assert (await client.get("/api/studies")).status_code == 401

    async def test_correct_code_completes_the_sign_in(self, client, db):
        await register(client)
        secret = await enable_totp(client, db)
        await client.post("/api/auth/logout")

        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

        res = await client.post("/api/auth/login/mfa", json={"code": fresh_code(secret)})
        assert res.status_code == 200, res.text
        assert res.json()["user"]["email"] == EMAIL
        assert SESSION_COOKIE in res.cookies

        assert (await client.get("/api/auth/me")).status_code == 200

    async def test_a_code_cannot_be_replayed_on_a_second_login(self, client, db):
        """The same code must not sign you in twice, even inside its 30s window."""
        await register(client)
        secret = await enable_totp(client, db)
        await client.post("/api/auth/logout")

        code = fresh_code(secret)

        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert (await client.post("/api/auth/login/mfa", json={"code": code})).status_code == 200
        await client.post("/api/auth/logout")

        # Same code, still cryptographically valid — but already spent.
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        replay = await client.post("/api/auth/login/mfa", json={"code": code})
        assert replay.status_code == 401
        assert "already been used" in replay.json()["detail"]

    async def test_enrolment_burns_its_own_code(self, client, db):
        """The code used to confirm the QR cannot then be used to log in.

        This is the replay guard's first real test: without it, the code a user types into
        the setup screen would remain a valid login for the rest of its window.
        """
        await register(client)

        begin = await client.post("/api/account/totp/begin")
        secret = begin.json()["secret"]
        setup_code = code_now(secret)
        assert (
            await client.post("/api/account/totp/confirm", json={"code": setup_code})
        ).status_code == 200

        await client.post("/api/auth/logout")
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

        reuse = await client.post("/api/auth/login/mfa", json={"code": setup_code})
        assert reuse.status_code == 401
        assert "already been used" in reuse.json()["detail"]

    async def test_the_mfa_step_needs_the_pending_cookie(self, client, db):
        await register(client)
        secret = await enable_totp(client, db)
        await client.post("/api/auth/logout")
        client.cookies.clear()

        # A valid code with no pending login is worthless: the password was never shown.
        res = await client.post("/api/auth/login/mfa", json={"code": fresh_code(secret)})
        assert res.status_code == 401
        assert "expired" in res.json()["detail"]

    async def test_brute_force_is_capped(self, client, db):
        await register(client)
        await enable_totp(client, db)
        await client.post("/api/auth/logout")

        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

        # A 6-digit code is a million guesses. Five wrong ones end the attempt.
        for _ in range(4):
            res = await client.post("/api/auth/login/mfa", json={"code": "000000"})
            assert res.status_code == 401

        final = await client.post("/api/auth/login/mfa", json={"code": "000000"})
        assert final.status_code == 429

        # The pending login is gone, so even the right code now fails.
        assert (await client.post("/api/auth/login/mfa", json={"code": "000000"})).status_code == 401


class TestRecoveryCodes:
    async def test_a_recovery_code_signs_you_in_once(self, client, db):
        await register(client)

        begin = await client.post("/api/account/totp/begin")
        secret = begin.json()["secret"]
        codes = (
            await client.post("/api/account/totp/confirm", json={"code": code_now(secret)})
        ).json()["codes"]

        await client.post("/api/auth/logout")

        # Phone lost: use a recovery code instead of a TOTP code, in the same box.
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        res = await client.post("/api/auth/login/mfa", json={"code": codes[0]})
        assert res.status_code == 200, res.text
        assert SESSION_COOKIE in res.cookies

        await client.post("/api/auth/logout")

        # ...and it is burned.
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        reuse = await client.post("/api/auth/login/mfa", json={"code": codes[0]})
        assert reuse.status_code == 401

        # A different code still works.
        second = await client.post("/api/auth/login/mfa", json={"code": codes[1]})
        assert second.status_code == 200

    async def test_codes_survive_being_retyped_by_a_human(self, client, db):
        await register(client)
        begin = await client.post("/api/account/totp/begin")
        secret = begin.json()["secret"]
        codes = (
            await client.post("/api/account/totp/confirm", json={"code": code_now(secret)})
        ).json()["codes"]

        await client.post("/api/auth/logout")
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

        # Lowercase, no dashes, stray spaces — all of which a person will produce.
        mangled = f"  {codes[0].replace('-', '').lower()} "
        assert (await client.post("/api/auth/login/mfa", json={"code": mangled})).status_code == 200


class TestEnrolmentSafety:
    async def test_an_unconfirmed_enrolment_does_not_gate_login(self, client, db):
        """Scanning the QR but never entering a code must not lock the user out."""
        await register(client)
        await client.post("/api/account/totp/begin")  # started, never confirmed
        await client.post("/api/auth/logout")

        res = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert res.status_code == 200
        assert res.json()["mfa_required"] is False
        assert SESSION_COOKIE in res.cookies

    async def test_the_secret_is_encrypted_at_rest(self, client, db):
        await register(client)
        secret = await enable_totp(client, db)

        row = (await db.execute(select(TotpCredential))).scalar_one()

        # A stolen index.db must not hand over the second factor.
        assert secret.encode() not in row.secret_encrypted
        assert crypto.decrypt(row.secret_encrypted) == secret

    async def test_disabling_totp_requires_the_password(self, client, db):
        await register(client)
        await enable_totp(client, db)

        # A stolen session must not be able to strip MFA off the account.
        bad = await client.post("/api/account/totp/disable", json={"password": "not-the-password"})
        assert bad.status_code == 401

        good = await client.post("/api/account/totp/disable", json={"password": PASSWORD})
        assert good.status_code == 204

        status = (await client.get("/api/account/security")).json()
        assert status["totp_enabled"] is False
        # The codes exist to recover a factor that no longer exists.
        assert status["recovery_codes_remaining"] == 0
