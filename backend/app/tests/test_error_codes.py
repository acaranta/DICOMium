"""The error contract.

Every error the UI can show must carry a code, because a bare English sentence cannot be
translated. These tests pin the shape — `{code, message, params}` — and the fallback behaviour
that keeps an un-translating client working.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio

EMAIL = "arthur@example.com"
PASSWORD = "correct-horse-battery"


async def register(client: AsyncClient) -> None:
    res = await client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert res.status_code == 201


class TestShape:
    async def test_an_error_carries_a_code_a_message_and_params(self, client: AsyncClient):
        res = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrong-password-here"},
        )

        assert res.status_code == 401
        detail = res.json()["detail"]
        assert detail["code"] == "auth.invalid_credentials"
        # The English survives, so a client that cannot translate still shows something real.
        assert detail["message"] == "Invalid email or password"
        assert detail["params"] == {}

    async def test_an_unsupported_language_is_refused_with_a_code(self, client: AsyncClient):
        await register(client)

        res = await client.patch(
            "/api/account/preferences", json={"language": "tlh"}  # Klingon: not on the list
        )

        assert res.status_code == 422
        assert res.json()["detail"]["code"] == "validation.failed"

    async def test_an_unauthenticated_request_is_coded(self, client: AsyncClient):
        res = await client.get("/api/account/preferences")

        assert res.status_code == 401
        assert res.json()["detail"]["code"] == "auth.not_authenticated"


class TestValidation:
    async def test_pydantics_own_messages_collapse_to_one_translatable_code(
        self, client: AsyncClient
    ):
        """Pydantic builds its messages internally, so no catalogue of ours can reach them.

        Rather than showing the user a machine's English, the 422 handler collapses them to a
        single code and tucks the raw errors into a field the UI ignores.
        """
        res = await client.post("/api/auth/login", json={"email": "not-an-email"})

        assert res.status_code == 422
        detail = res.json()["detail"]
        assert detail["code"] == "validation.failed"
        assert detail["message"]  # a human sentence, not a key
        # The developer-facing detail is still there for debugging.
        assert isinstance(detail["errors"], list) and detail["errors"]
