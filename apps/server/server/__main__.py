import asyncio
import sys

import uvicorn

from server.settings import settings


def _configure_event_loop_policy() -> None:
    if sys.platform == "win32" and hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def main() -> None:
    _configure_event_loop_policy()
    uvicorn.run(
        "server.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info" if not settings.debug else "debug",
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
