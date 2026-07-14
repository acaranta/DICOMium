"""The study list, and its pagination.

The list endpoint had no test at all, which is how it came to return a bare array with no total —
leaving the interface to count the rows it was handed and report "100 exams" to someone with
three thousand.

What is pinned here is the part that is easy to get subtly wrong: the total must count the rows
matching the *filters*, and paging must not show a study twice or skip one when two share a
study date.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study

pytestmark = pytest.mark.anyio

EMAIL = "arthur@example.com"
PASSWORD = "correct-horse-battery"


async def register(client: AsyncClient) -> int:
    res = await client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert res.status_code == 201
    return int(res.json()["id"])


async def seed(
    db: AsyncSession,
    user_id: int,
    count: int,
    *,
    study_date: str | None = "20240115",
    name: str = "DOE^JANE",
) -> None:
    """`count` studies, all on the same date unless told otherwise.

    Same-date is the interesting case, not an incidental one: it is exactly the tie that an
    unstable sort reorders between pages.
    """
    for i in range(count):
        db.add(
            Study(
                user_id=user_id,
                study_instance_uid=f"1.2.840.{user_id}.{i}",
                patient_name=name,
                patient_id=f"ANON-{i:05d}",
                study_date=study_date,
                study_description=f"EXAM {i}",
                dir_path=f"user/{i}",
            )
        )
    await db.commit()


class TestTheTotal:
    async def test_it_counts_the_whole_library_not_the_page(
        self, client: AsyncClient, db: AsyncSession
    ):
        user_id = await register(client)
        await seed(db, user_id, 120)

        res = await client.get("/api/studies", params={"limit": 50})

        assert res.status_code == 200
        body = res.json()
        assert len(body["items"]) == 50  # one page
        assert body["total"] == 120  # …but the truth about the library
        assert body["limit"] == 50
        assert body["offset"] == 0

    async def test_it_counts_what_matches_the_filter_not_everything(
        self, client: AsyncClient, db: AsyncSession
    ):
        """A total that ignored the search would make the pager offer pages that do not exist."""
        user_id = await register(client)
        await seed(db, user_id, 100, name="DOE^JANE")
        await seed_needles(db, user_id)

        res = await client.get("/api/studies", params={"q": "ROE"})

        body = res.json()
        assert body["total"] == 3
        assert len(body["items"]) == 3

    async def test_another_users_studies_are_not_counted(
        self, client: AsyncClient, db: AsyncSession
    ):
        """The total is scoped to the caller. A count that leaked across accounts would disclose
        how many exams someone else holds — and hand out pages of them."""
        mine = await register(client)

        other = await client.post(
            "/api/auth/register",
            json={"email": "someone.else@example.com", "password": PASSWORD},
        )
        assert other.status_code == 201
        theirs = int(other.json()["id"])

        await seed(db, mine, 5)
        await seed(db, theirs, 40)

        # Registering signs you in, so the session cookie is now the second user's. Sign back in.
        await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

        res = await client.get("/api/studies")

        assert res.json()["total"] == 5


async def seed_needles(db: AsyncSession, user_id: int) -> None:
    for i in range(3):
        db.add(
            Study(
                user_id=user_id,
                study_instance_uid=f"1.2.840.needle.{i}",
                patient_name="ROE^RICHARD",
                patient_id=f"NEEDLE-{i}",
                study_date="20240115",
                dir_path=f"user/needle/{i}",
            )
        )
    await db.commit()


class TestPaging:
    async def test_pages_do_not_repeat_or_skip_a_study(
        self, client: AsyncClient, db: AsyncSession
    ):
        """The tiebreaker.

        Every study here shares one study_date. Ordering on the date alone leaves SQLite free to
        return the ties in any order it likes, so a study could appear on both page 1 and page 2
        while another appeared on neither. Walking every page and comparing the set to the total
        is what catches that.
        """
        user_id = await register(client)
        await seed(db, user_id, 55, study_date="20240115")

        seen: list[str] = []
        for offset in (0, 20, 40):
            res = await client.get("/api/studies", params={"limit": 20, "offset": offset})
            seen += [s["study_instance_uid"] for s in res.json()["items"]]

        assert len(seen) == 55
        assert len(set(seen)) == 55  # nothing served twice, nothing missed

    async def test_an_offset_past_the_end_is_an_empty_page_not_an_error(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Deleting the last row of the last page strands the UI here. It must not 404."""
        user_id = await register(client)
        await seed(db, user_id, 10)

        res = await client.get("/api/studies", params={"offset": 500})

        assert res.status_code == 200
        assert res.json()["items"] == []
        assert res.json()["total"] == 10  # still tells the truth, so the UI can clamp back


class TestLimitIsBounded:
    async def test_a_negative_limit_is_refused(self, client: AsyncClient, db: AsyncSession):
        """`limit=-1` used to reach SQLite as `LIMIT -1`, which means *no limit at all*.

        One request would then pull an entire library into memory.
        """
        user_id = await register(client)
        await seed(db, user_id, 30)

        res = await client.get("/api/studies", params={"limit": -1})

        assert res.status_code == 422
        assert res.json()["detail"]["code"] == "validation.failed"

    async def test_an_oversized_limit_is_refused(self, client: AsyncClient, db: AsyncSession):
        await register(client)

        res = await client.get("/api/studies", params={"limit": 501})

        assert res.status_code == 422

    async def test_the_ceiling_itself_is_allowed(self, client: AsyncClient, db: AsyncSession):
        await register(client)

        res = await client.get("/api/studies", params={"limit": 500})

        assert res.status_code == 200
