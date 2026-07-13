"""Liveness probe. Unauthenticated by design — it is the container healthcheck."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import DbSession
from app.services import jobs

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(db: DbSession) -> dict:
    await db.execute(text("SELECT 1"))
    return {"status": "healthy", "ingest_jobs_running": jobs.running_count()}
