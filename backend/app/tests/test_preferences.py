"""Avatar preferences.

The load-bearing assertion here is the privacy one: **Gravatar must be off by default.**
Turning it on makes the browser hand a hash of the user's email — and their IP — to a third
party, which is in direct tension with this app's whole premise. A regression that flipped the
default would silently break that promise for every existing user, and nobody would notice.
"""

from __future__ import annotations

import hashlib

import pytest
from sqlalchemy import select

from app.models import AVATAR_COLORS, AVATAR_STYLES, UserPreference
from app.services.avatar import defaults_for, gravatar_hash

PASSWORD = "correct-horse-battery"
EMAIL = "arthur@example.com"


async def register(client) -> None:
    res = await client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert res.status_code == 201


class TestGravatarIsOptIn:
    async def test_gravatar_is_off_by_default(self, client):
        await register(client)

        prefs = (await client.get("/api/account/preferences")).json()
        assert prefs["use_gravatar"] is False

        me = (await client.get("/api/auth/me")).json()
        assert me["use_gravatar"] is False

    async def test_it_can_be_turned_on_and_off_again(self, client):
        await register(client)

        on = await client.patch("/api/account/preferences", json={"use_gravatar": True})
        assert on.status_code == 200
        assert on.json()["use_gravatar"] is True
        assert (await client.get("/api/auth/me")).json()["use_gravatar"] is True

        off = await client.patch("/api/account/preferences", json={"use_gravatar": False})
        assert off.json()["use_gravatar"] is False


class TestGravatarHash:
    def test_is_sha256_of_the_normalised_email(self):
        # Gravatar's current API keys on the SHA-256 of the trimmed, lower-cased address.
        expected = hashlib.sha256(b"arthur@example.com").hexdigest()
        assert gravatar_hash("  Arthur@Example.COM  ") == expected

    async def test_it_is_returned_even_when_gravatar_is_off(self, client):
        # The hash is inert on its own: it is only ever *used* when use_gravatar is true. Sending
        # it unconditionally means enabling the switch needs no extra round-trip.
        await register(client)
        me = (await client.get("/api/auth/me")).json()
        assert me["gravatar_hash"] == gravatar_hash(EMAIL)
        assert me["use_gravatar"] is False


class TestDefaults:
    async def test_a_user_with_no_row_still_gets_an_avatar(self, client, db):
        """Defaults materialise lazily — existing accounts need no backfill."""
        await register(client)

        me = (await client.get("/api/auth/me")).json()
        assert me["avatar_style"] in AVATAR_STYLES
        assert me["avatar_color"] in AVATAR_COLORS

    def test_defaults_are_deterministic(self):
        # The same email must always produce the same avatar, or it would change between the
        # header and the account page, or between sessions.
        first = defaults_for("arthur@example.com")
        second = defaults_for("arthur@example.com")
        assert first == second
        assert first[0] in AVATAR_STYLES
        assert first[1] in AVATAR_COLORS

    def test_different_emails_generally_differ(self):
        colors = {defaults_for(f"user{i}@example.com")[1] for i in range(40)}
        # With 8 colours and 40 emails, a hash worth the name spreads them out.
        assert len(colors) >= 5

    def test_normalisation_means_case_does_not_change_the_avatar(self):
        assert defaults_for("Arthur@Example.com") == defaults_for("arthur@example.com")


class TestValidation:
    @pytest.mark.parametrize("field", ["avatar_style", "avatar_color"])
    async def test_unknown_values_are_rejected(self, client, field):
        await register(client)

        res = await client.patch("/api/account/preferences", json={field: "chartreuse-hexagon"})
        # 422: it must never reach the database and then fail to render in the browser.
        assert res.status_code == 422

    async def test_known_values_are_accepted_and_persist(self, client, db):
        await register(client)

        res = await client.patch(
            "/api/account/preferences",
            json={"avatar_style": "gradient", "avatar_color": "violet"},
        )
        assert res.status_code == 200
        assert res.json()["avatar_style"] == "gradient"
        assert res.json()["avatar_color"] == "violet"

        # Round-trip through the database, not just the response object.
        row = (await db.execute(select(UserPreference))).scalar_one()
        assert (row.avatar_style, row.avatar_color) == ("gradient", "violet")

        assert (await client.get("/api/auth/me")).json()["avatar_color"] == "violet"

    async def test_a_patch_changes_only_what_it_names(self, client):
        await register(client)
        await client.patch(
            "/api/account/preferences",
            json={"avatar_style": "ring", "avatar_color": "amber", "use_gravatar": True},
        )

        after = (await client.patch("/api/account/preferences", json={"avatar_color": "rose"})).json()
        assert after["avatar_color"] == "rose"
        assert after["avatar_style"] == "ring"      # untouched
        assert after["use_gravatar"] is True        # untouched

    async def test_the_valid_sets_are_advertised(self, client):
        # The UI renders from these rather than hardcoding a list that could drift out of sync
        # with what the server actually accepts.
        await register(client)
        prefs = (await client.get("/api/account/preferences")).json()
        assert set(prefs["available_styles"]) == set(AVATAR_STYLES)
        assert set(prefs["available_colors"]) == set(AVATAR_COLORS)


class TestAuth:
    async def test_preferences_require_a_session(self, client):
        assert (await client.get("/api/account/preferences")).status_code == 401
        assert (
            await client.patch("/api/account/preferences", json={"avatar_color": "rose"})
        ).status_code == 401
