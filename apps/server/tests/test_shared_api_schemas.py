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


def test_shared_schemas_include_spec_render_contracts() -> None:
    assert hasattr(schemas, "RenderPreset")
    assert [item.value for item in schemas.RenderPreset] == ["draft", "final"]

    assert hasattr(schemas, "RenderResolution")
    assert [item.value for item in schemas.RenderResolution] == [
        "1920x1080",
        "1280x720",
        "1080x1920",
    ]

    assert hasattr(schemas, "RenderStage")
    assert [item.value for item in schemas.RenderStage] == [
        "queued",
        "verify_alignment_cache",
        "pre_render_cached_clips",
        "build_subtitles_srt",
        "compose_filtergraph",
        "mux_mp4_faststart",
        "append_render_history_to_app_db",
    ]

    assert hasattr(schemas, "RenderPageState")
    assert [item.value for item in schemas.RenderPageState] == [
        "idle",
        "queued",
        "verifying",
        "prerender",
        "subtitles",
        "composing",
        "muxing",
        "logging_history",
        "done",
        "cancelling",
        "cancelled",
        "failed",
        "output_missing",
        "partial_excluded",
        "ffmpeg_warning",
        "ffmpeg_fatal_error",
        "history_empty",
    ]

    assert hasattr(schemas, "RenderBackendCapabilities")
    capabilities_fields = schemas.RenderBackendCapabilities.model_fields
    assert "reveal_in_explorer_supported" in capabilities_fields

    assert hasattr(schemas, "RenderHistoryRow")
    history_fields = schemas.RenderHistoryRow.model_fields
    for field_name in (
        "filename",
        "preset",
        "resolution",
        "duration_s",
        "status",
        "output_path",
        "output_exists",
        "file_size",
        "artifacts",
        "events",
    ):
        assert field_name in history_fields


def test_shared_schemas_include_v11_project_contracts() -> None:
    assert hasattr(schemas, "BackgroundScheduleSegment")
    schedule_fields = schemas.BackgroundScheduleSegment.model_fields
    for field_name in ("id", "media_id", "start", "end", "locked_duration"):
        assert field_name in schedule_fields
        assert schedule_fields[field_name].is_required()

    background_fields = schemas.BackgroundItem.model_fields
    assert "schedule" in background_fields
    assert not background_fields["schedule"].is_required()

    subtitle_fields = schemas.SubtitleStyle.model_fields
    assert subtitle_fields["color"].default == "#ffffff"
    assert subtitle_fields["bg_color"].default == "#000000"
    assert subtitle_fields["bg_opacity"].default == 62
    assert subtitle_fields["bg_radius"].default == 8
