import uvicorn

from server.settings import settings


def main() -> None:
    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info" if not settings.debug else "debug",
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
