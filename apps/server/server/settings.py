from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_app_db_path() -> Path:
    import os

    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", "~")) / "videocreator"
    else:
        base = Path("~/.videocreator").expanduser()
    base.mkdir(parents=True, exist_ok=True)
    return base / "app.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="VC_",
        case_sensitive=False,
    )

    host: str = "127.0.0.1"
    port: int = 8787
    debug: bool = False
    whisperx_model: str = "large-v3"
    storage_root: Path | None = Field(
        default=None,
        description="Optional override for workspace root used by global uploads storage.",
    )
    app_db_path: Path = Field(
        default_factory=_default_app_db_path,
        description="SQLite DB for global app state (recent projects, settings).",
    )


settings = Settings()


def app_root() -> Path:
    if settings.storage_root is not None:
        return settings.storage_root.resolve()
    cwd = Path.cwd().resolve()
    if cwd.name == "server" and cwd.parent.name == "apps":
        return cwd.parent.parent
    return cwd


def uploads_root() -> Path:
    return app_root() / "uploads"
