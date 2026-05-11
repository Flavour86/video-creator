from __future__ import annotations

from server.domain import project as _project_schema_path  # noqa: F401
from server.routes import projects
from server import runtime_status
import schemas


def test_shared_schemas_export_runtime_and_recent_project_models() -> None:
    assert hasattr(schemas, "RuntimeHealthResponse")
    assert hasattr(schemas, "RecentProject")
    assert hasattr(schemas, "RecentProjectCard")
    assert hasattr(schemas, "SetupDraft")
    assert hasattr(schemas, "AlignmentStateResponse")
    assert hasattr(schemas, "RenderHistoryRow")
    assert hasattr(schemas, "RenderArtifact")
    assert hasattr(schemas, "ProjectConfigLoadResponse")
    assert hasattr(schemas, "ProjectConfigSaveResponse")


def test_backend_response_models_use_generated_shared_schemas() -> None:
    assert runtime_status.RuntimeHealthResponse is schemas.RuntimeHealthResponse
    assert projects.RecentProject is schemas.RecentProject
