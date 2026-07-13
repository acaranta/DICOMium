"""TOTP verification, and specifically the replay guard.

Verifying a code is the easy half. The half that gets skipped — and that turns a second
factor back into a single one — is recording which 30-second step was consumed. Without
it, a code read over someone's shoulder stays valid for the rest of its window.
"""

from __future__ import annotations

import pyotp
import pytest

from app.services.totp import DIGITS, PERIOD, counter_now, new_secret, verify


@pytest.fixture
def secret() -> str:
    return new_secret()


def code_at(secret: str, at: float) -> str:
    return pyotp.TOTP(secret, digits=DIGITS, interval=PERIOD).at(at)


class TestVerify:
    def test_accepts_the_current_code(self, secret):
        now = 1_700_000_000.0
        result = verify(secret, code_at(secret, now), last_counter=0, at=now)
        assert result.ok
        assert result.counter == counter_now(now)

    def test_rejects_a_wrong_code(self, secret):
        now = 1_700_000_000.0
        assert not verify(secret, "000000", last_counter=0, at=now).ok

    @pytest.mark.parametrize("bad", ["", "12345", "1234567", "abcdef", "12 34 56"])
    def test_rejects_malformed_input(self, secret, bad):
        assert not verify(secret, bad, last_counter=0).ok

    def test_tolerates_clock_drift_of_one_step(self, secret):
        now = 1_700_000_000.0
        # A phone running ~30s slow or fast still works.
        assert verify(secret, code_at(secret, now - PERIOD), last_counter=0, at=now).ok
        assert verify(secret, code_at(secret, now + PERIOD), last_counter=0, at=now).ok

    def test_rejects_a_code_from_outside_the_window(self, secret):
        now = 1_700_000_000.0
        assert not verify(secret, code_at(secret, now - 5 * PERIOD), last_counter=0, at=now).ok


class TestReplayGuard:
    def test_the_same_code_cannot_be_used_twice(self, secret):
        now = 1_700_000_000.0
        code = code_at(secret, now)

        first = verify(secret, code, last_counter=0, at=now)
        assert first.ok

        # The caller persists first.counter; a replay inside the same window must now fail,
        # even though the code is still cryptographically current.
        replay = verify(secret, code, last_counter=first.counter, at=now)
        assert not replay.ok
        assert "already been used" in replay.reason

    def test_an_older_step_is_refused_after_a_newer_one(self, secret):
        now = 1_700_000_000.0
        current = verify(secret, code_at(secret, now), last_counter=0, at=now)
        assert current.ok

        # The previous step is still inside the drift window, but it is behind the counter
        # we already accepted — so it must not be replayable either.
        previous = verify(
            secret, code_at(secret, now - PERIOD), last_counter=current.counter, at=now
        )
        assert not previous.ok

    def test_the_next_code_still_works(self, secret):
        now = 1_700_000_000.0
        first = verify(secret, code_at(secret, now), last_counter=0, at=now)
        assert first.ok

        later = now + PERIOD
        second = verify(secret, code_at(secret, later), last_counter=first.counter, at=later)
        assert second.ok
        assert second.counter > first.counter


class TestEnrolment:
    def test_secret_is_base32_and_the_uri_carries_the_issuer(self):
        from app.services.totp import enrolment_for

        secret = new_secret()
        enrolment = enrolment_for(secret, "arthur@example.com")

        assert enrolment.secret == secret
        assert enrolment.uri.startswith("otpauth://totp/")
        assert "issuer=DICOMium" in enrolment.uri
        assert enrolment.qr_data_url.startswith("data:image/png;base64,")

        # An authenticator app must be able to parse it back.
        parsed = pyotp.parse_uri(enrolment.uri)
        assert parsed.secret == secret
