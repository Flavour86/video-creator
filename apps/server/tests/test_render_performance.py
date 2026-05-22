"""Hardware-sensitive render performance checks.

Run explicitly after collecting benchmark JSON:
    $env:VC_RENDER_PERF = "1"
    $env:VC_RENDER_PERF_RESULTS = "E:/path/to/render-performance.json"
    pnpm -F @vc/server test -- test_render_performance.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("VC_RENDER_PERF") != "1",
    reason="Set VC_RENDER_PERF=1 and VC_RENDER_PERF_RESULTS to run render performance checks.",
)

RENDER_RATIO_THRESHOLDS = {
    "draft_720p": 1.0,
    "final_1080p": 2.5,
    "vertical_9_16": 1.2,
}


def _benchmark_results() -> dict[str, Any]:
    results_path = os.environ.get("VC_RENDER_PERF_RESULTS")
    if not results_path:
        pytest.fail("Set VC_RENDER_PERF_RESULTS to a benchmark JSON file.")
    return json.loads(Path(results_path).read_text(encoding="utf-8"))


@pytest.mark.parametrize(("case_id", "max_ratio"), RENDER_RATIO_THRESHOLDS.items())
def test_render_benchmark_ratios_stay_within_spec(case_id: str, max_ratio: float) -> None:
    result = _benchmark_results()[case_id]
    elapsed_s = float(result["elapsed_s"])
    voice_duration_s = float(result["voice_duration_s"])

    assert elapsed_s <= voice_duration_s * max_ratio


def test_render_websocket_cadence_benchmark_meets_spec() -> None:
    result = _benchmark_results()["ws_cadence"]

    assert float(result["events_per_second"]) >= 1.0
