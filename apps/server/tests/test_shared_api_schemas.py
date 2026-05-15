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


def test_shared_schemas_include_launcher_and_setup_contracts() -> None:
    assert hasattr(schemas, "SetupOutputPreset")
    assert [item.value for item in schemas.SetupOutputPreset] == ["draft", "final", "vertical"]

    assert hasattr(schemas, "LauncherRenderStatusTag")
    assert [item.value for item in schemas.LauncherRenderStatusTag] == [
        "unrendered",
        "queued",
        "rendering",
        "rendered",
        "failed",
        "cancelled",
    ]

    assert hasattr(schemas, "SetupSubtitleGenerationResult")
    assert hasattr(schemas, "SetupSubtitleGenerationState")
    assert hasattr(schemas, "SetupSubtitleCacheState")
    assert [item.value for item in schemas.SetupSubtitleGenerationState] == [
        "ready",
        "running",
        "succeeded",
        "failed",
    ]
    assert [item.value for item in schemas.SetupSubtitleCacheState] == [
        "unknown",
        "hit",
        "miss",
    ]

    assert hasattr(schemas, "PaginationMeta")
    assert hasattr(schemas, "RecentProjectsPage")

    setup_draft_fields = schemas.SetupDraft.model_fields
    assert "output_preset" in setup_draft_fields
    assert "subtitle_generation" in setup_draft_fields

    project_card_fields = schemas.RecentProjectCard.model_fields
    assert "render_status_tag" in project_card_fields
    assert "last_render_at" in project_card_fields
    assert not project_card_fields["last_render_at"].is_required()
