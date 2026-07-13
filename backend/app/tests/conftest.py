"""Test fixtures: an isolated app instance with its own temp data dir and database."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path, monkeypatch):
    """Point every test at its own DATA_DIR and DICOM_ROOT.

    Also resets the cached Settings and the cached Fernet key, so the encryption key is
    regenerated per test rather than leaking between them.
    """
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DICOM_ROOT", str(tmp_path / "dicomfiles"))
    monkeypatch.delenv("WEBAUTHN_RP_ID", raising=False)
    monkeypatch.delenv("WEBAUTHN_ORIGIN", raising=False)
    # bcrypt is deliberately slow, and each TOTP enrolment issues 10 recovery codes — that
    # is 10 slow hashes per test. Cost 4 keeps the suite usable without changing behaviour.
    monkeypatch.setenv("BCRYPT_ROUNDS", "4")

    from app.config import get_settings
    from app.services import crypto

    get_settings.cache_clear()
    crypto._fernet.cache_clear()

    yield

    get_settings.cache_clear()
    crypto._fernet.cache_clear()


@pytest_asyncio.fixture
async def client(isolated_settings) -> AsyncIterator[AsyncClient]:
    """An HTTP client bound to a freshly-initialized app."""
    from app.db.engine import dispose_engine
    from app.db.init import init_db
    from app.main import app

    await dispose_engine()  # drop any engine a previous test left behind
    await init_db()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost:8080",
        # WebAuthn RP derivation reads this.
        headers={"origin": "http://localhost:8080"},
    ) as http:
        yield http

    await dispose_engine()


@pytest_asyncio.fixture
async def db():
    from app.db.engine import get_sessionmaker

    async with get_sessionmaker()() as session:
        yield session
