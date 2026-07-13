"""Relying Party resolution.

The RP ID is what binds a passkey to a domain. Get it wrong and either passkeys silently
stop working after a deployment, or — worse — the app happily accepts assertions meant for
somewhere else.
"""

from __future__ import annotations

import pytest

from dataclasses import dataclass

from app.config import get_settings
from app.services.webauthn import (
    InsecureContextError,
    WebAuthnError,
    effective_origin,
    resolve_rp,
)


@dataclass
class FakeUrl:
    scheme: str


@dataclass
class FakeRequest:
    headers: dict
    url: FakeUrl


class TestEffectiveOrigin:
    """Browsers only send Origin on cross-origin requests and same-origin NON-GET requests.

    A same-origin GET — such as the account page fetching its security status — carries no
    Origin header at all. Deriving the RP from that header alone therefore reported
    "passkeys unsupported" on a page where passkeys worked perfectly. Fall back to Host.
    """

    def test_origin_header_wins_when_present(self):
        request = FakeRequest(
            headers={"origin": "https://dicomium.example.com", "host": "internal:8080"},
            url=FakeUrl("http"),
        )
        assert effective_origin(request) == "https://dicomium.example.com"

    def test_falls_back_to_host_on_a_get_with_no_origin(self):
        request = FakeRequest(headers={"host": "localhost:8080"}, url=FakeUrl("http"))
        assert effective_origin(request) == "http://localhost:8080"

    def test_uses_the_forwarded_scheme_behind_a_tls_proxy(self):
        # nginx speaks plain HTTP to uvicorn on the loopback, so request.url.scheme is
        # "http" even when the browser is on HTTPS. Trusting it would break passkeys behind
        # every reverse proxy.
        request = FakeRequest(
            headers={"host": "dicomium.example.com", "x-forwarded-proto": "https"},
            url=FakeUrl("http"),
        )
        assert effective_origin(request) == "https://dicomium.example.com"

    def test_takes_the_first_hop_from_a_forwarded_chain(self):
        request = FakeRequest(
            headers={"host": "dicomium.example.com", "x-forwarded-proto": "https, http"},
            url=FakeUrl("http"),
        )
        assert effective_origin(request) == "https://dicomium.example.com"

    def test_no_host_at_all(self):
        assert effective_origin(FakeRequest(headers={}, url=FakeUrl("http"))) is None


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestAutoDerivation:
    def test_localhost_over_http_is_allowed(self):
        # The one exception browsers make. Without it, local development is impossible.
        rp = resolve_rp("http://localhost:8080")
        assert rp.rp_id == "localhost"
        assert rp.origin == "http://localhost:8080"

    def test_https_domain(self):
        rp = resolve_rp("https://dicomium.example.com")
        # The RP ID is the bare host: no scheme, no port.
        assert rp.rp_id == "dicomium.example.com"
        assert rp.origin == "https://dicomium.example.com"

    def test_https_with_a_port_keeps_the_port_in_the_origin_only(self):
        rp = resolve_rp("https://dicomium.example.com:8443")
        assert rp.rp_id == "dicomium.example.com"
        assert rp.origin == "https://dicomium.example.com:8443"

    def test_plain_http_on_a_lan_address_is_refused_with_an_explanation(self):
        # The browser would refuse this anyway. Failing here, with a sentence the user can
        # act on, beats an opaque DOM exception in the console.
        with pytest.raises(InsecureContextError) as exc:
            resolve_rp("http://192.168.1.50:8080")

        message = str(exc.value)
        assert "HTTPS" in message
        assert "Password sign-in still works" in message

    def test_missing_origin(self):
        with pytest.raises(WebAuthnError, match="determine this instance's domain"):
            resolve_rp(None)

    def test_unparseable_origin(self):
        with pytest.raises(WebAuthnError):
            resolve_rp("not-a-url")


class TestEnvOverride:
    def test_explicit_settings_win_over_the_header(self, monkeypatch):
        monkeypatch.setenv("WEBAUTHN_RP_ID", "pinned.example.com")
        monkeypatch.setenv("WEBAUTHN_ORIGIN", "https://pinned.example.com")
        get_settings.cache_clear()

        rp = resolve_rp("https://something-else.example.com")
        assert rp.rp_id == "pinned.example.com"
        assert rp.origin == "https://pinned.example.com"

    def test_override_bypasses_the_secure_context_check(self, monkeypatch):
        # Pinning is an explicit act by an operator who knows their topology (e.g. TLS
        # terminating upstream). We do not second-guess it.
        monkeypatch.setenv("WEBAUTHN_RP_ID", "dicomium.internal")
        monkeypatch.setenv("WEBAUTHN_ORIGIN", "https://dicomium.internal")
        get_settings.cache_clear()

        rp = resolve_rp("http://192.168.1.50:8080")
        assert rp.rp_id == "dicomium.internal"

    def test_trailing_slash_is_stripped(self, monkeypatch):
        monkeypatch.setenv("WEBAUTHN_RP_ID", "dicomium.internal")
        monkeypatch.setenv("WEBAUTHN_ORIGIN", "https://dicomium.internal/")
        get_settings.cache_clear()

        # An origin with a trailing slash never matches what the browser sends.
        assert resolve_rp(None).origin == "https://dicomium.internal"
