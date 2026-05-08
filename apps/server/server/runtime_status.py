from __future__ import annotations

import importlib
import importlib.util
import platform
import re
import subprocess
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from server.db.projects import list_recent
from server.pipeline.render import active_render_count
from server.settings import Settings

SERVER_VERSION = "0.1.0"
RuntimeState = Literal["ready", "unavailable", "unknown"]


class SidecarStatus(BaseModel):
    status: RuntimeState
    address: str
    version: str


class VersionedRuntimeStatus(BaseModel):
    status: RuntimeState
    version: str


class CudaStatus(BaseModel):
    status: RuntimeState
    available: bool | None
    version: str
    gpu_label: str | None


class WhisperXStatus(BaseModel):
    status: RuntimeState
    model: str


class RuntimeHealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    active_renders: int = Field(
        ge=0,
        description="Number of render jobs currently tracked by the active render manager.",
    )
    cached_projects: int = Field(
        ge=0,
        description=(
            "Count of the latest 500 recent projects whose project folder contains a .vc "
            "cache directory."
        ),
    )
    sidecar: SidecarStatus
    python: VersionedRuntimeStatus
    ffmpeg: VersionedRuntimeStatus
    cuda: CudaStatus
    whisperx: WhisperXStatus


def collect_runtime_health(settings: Settings) -> RuntimeHealthResponse:
    return RuntimeHealthResponse(
        status="ok",
        version=SERVER_VERSION,
        active_renders=active_render_count(),
        cached_projects=count_cached_projects(),
        sidecar=SidecarStatus(
            status="ready",
            address=f"http://{settings.host}:{settings.port}",
            version=SERVER_VERSION,
        ),
        python=VersionedRuntimeStatus(status="ready", version=platform.python_version()),
        ffmpeg=_detect_ffmpeg_status(),
        cuda=_detect_cuda_status(),
        whisperx=_detect_whisperx_status(settings.whisperx_model),
    )


def count_cached_projects() -> int:
    return sum(1 for row in list_recent(limit=500) if (Path(row["path"]) / ".vc").is_dir())


def _detect_ffmpeg_status() -> VersionedRuntimeStatus:
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return VersionedRuntimeStatus(status="unavailable", version="unknown")

    if result.returncode != 0:
        return VersionedRuntimeStatus(status="unavailable", version="unknown")

    return VersionedRuntimeStatus(
        status="ready",
        version=_parse_ffmpeg_version(result.stdout),
    )


def _parse_ffmpeg_version(output: str) -> str:
    first_line = output.splitlines()[0] if output.splitlines() else ""
    match = re.search(r"ffmpeg version\s+([^\s]+)", first_line)
    if match is None:
        return "unknown"
    return match.group(1)


def _detect_cuda_status() -> CudaStatus:
    try:
        torch = importlib.import_module("torch")
    except ImportError:
        return CudaStatus(
            status="unavailable",
            available=False,
            version="unknown",
            gpu_label=None,
        )

    cuda = getattr(torch, "cuda", None)
    if cuda is None:
        return CudaStatus(
            status="unavailable",
            available=False,
            version=_torch_cuda_version(torch),
            gpu_label=None,
        )

    try:
        is_available = bool(cuda.is_available())
    except Exception:
        return CudaStatus(
            status="unknown",
            available=None,
            version=_torch_cuda_version(torch),
            gpu_label=None,
        )

    return CudaStatus(
        status="ready" if is_available else "unavailable",
        available=is_available,
        version=_torch_cuda_version(torch),
        gpu_label=_cuda_gpu_label(cuda) if is_available else None,
    )


def _torch_cuda_version(torch: Any) -> str:
    version_module = getattr(torch, "version", None)
    version = getattr(version_module, "cuda", None)
    return str(version) if version else "unknown"


def _cuda_gpu_label(cuda: Any) -> str | None:
    try:
        return str(cuda.get_device_name(0))
    except Exception:
        return None


def _detect_whisperx_status(model: str) -> WhisperXStatus:
    try:
        is_installed = importlib.util.find_spec("whisperx") is not None
    except (ImportError, ValueError):
        is_installed = False

    return WhisperXStatus(
        status="ready" if is_installed else "unavailable",
        model=model,
    )
