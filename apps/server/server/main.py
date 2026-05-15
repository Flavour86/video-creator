import asyncio
import logging

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from server.db.app_db import AppDatabaseError
from server.routes.alignment import router as alignment_router
from server.routes.media import router as media_router
from server.routes.projects import router as projects_router
from server.routes.render import router as render_router
from server.routes.setup import router as setup_router
from server.routes.setup import subtitle_router
from server.routes.uploads import router as uploads_router
from server.routes.ws import router as ws_router
from server.runtime_status import RuntimeHealthResponse, collect_runtime_health
from server.settings import settings

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer()
        if settings.debug
        else structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()

app = FastAPI(title="Video Creator Sidecar", version="0.1.0")
app.include_router(projects_router)
app.include_router(media_router)
app.include_router(alignment_router)
app.include_router(render_router)
app.include_router(setup_router)
app.include_router(subtitle_router)
app.include_router(uploads_router)
app.include_router(ws_router)


@app.exception_handler(AppDatabaseError)
async def app_db_error_handler(_request: Request, _exc: AppDatabaseError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "APP_DB_UNAVAILABLE",
                "message": "Application database is temporarily unavailable.",
                "details": {},
            }
        },
    )


@app.get("/health", response_model=RuntimeHealthResponse)
async def health() -> RuntimeHealthResponse:
    return await asyncio.to_thread(collect_runtime_health, settings)


@app.on_event("startup")
async def startup() -> None:
    log.info("server.startup", host=settings.host, port=settings.port)


@app.on_event("shutdown")
async def shutdown() -> None:
    log.info("server.shutdown")
