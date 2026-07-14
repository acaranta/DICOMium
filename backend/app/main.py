"""FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db.engine import dispose_engine
from app.db.init import init_db
from app.logging_conf import setup_logging
from app.routes import (
    account,
    admin,
    auth,
    dicomweb_qido,
    dicomweb_wado,
    health,
    library,
    uploads,
)
from app.services import jobs

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    log.info("DICOMium starting (dicom_root=%s, data_dir=%s)", settings.dicom_root, settings.data_dir)
    await init_db()
    yield
    await jobs.shutdown()
    await dispose_engine()
    log.info("DICOMium stopped")


app = FastAPI(
    title="DICOMium",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Give Pydantic's 422 the same shape as an AppError.

    Pydantic composes its messages ("field required", "value is not a valid email address")
    internally, so no catalogue of ours can reach them. Rather than show the user a machine's
    English, we collapse the lot to a single translatable code and keep the raw errors in a
    field the UI ignores but a developer can read.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": {
                "code": "validation.failed",
                "message": "Please check the details you entered",
                "params": {},
                "errors": jsonable_encoder(exc.errors()),
            }
        },
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(account.router)
app.include_router(admin.router)
app.include_router(uploads.router)
app.include_router(library.router)
app.include_router(dicomweb_qido.router)
app.include_router(dicomweb_wado.router)
