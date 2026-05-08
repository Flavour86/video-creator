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
    app_db_path: Path = Field(
        default_factory=_default_app_db_path,
        description="SQLite DB for global app state (recent projects, settings).",
    )


settings = Settings()
