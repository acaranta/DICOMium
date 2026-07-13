"""FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.db.engine import dispose_engine
from app.db.init import init_db
from app.logging_conf import setup_logging
from app.routes import admin, auth, dicomweb_qido, dicomweb_wado, health, library, uploads
from app.services import jobs

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    log.info("webdicom starting (dicom_root=%s, data_dir=%s)", settings.dicom_root, settings.data_dir)
    await init_db()
    yield
    await jobs.shutdown()
    await dispose_engine()
    log.info("webdicom stopped")


app = FastAPI(
    title="webdicom",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(uploads.router)
app.include_router(library.router)
app.include_router(dicomweb_qido.router)
app.include_router(dicomweb_wado.router)
