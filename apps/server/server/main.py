import logging

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from server.routes.alignment import router as alignment_router
from server.routes.media import router as media_router
from server.routes.projects import router as projects_router
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


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "version": "0.1.0"})


@app.on_event("startup")
async def startup() -> None:
    log.info("server.startup", host=settings.host, port=settings.port)


@app.on_event("shutdown")
async def shutdown() -> None:
    log.info("server.shutdown")
