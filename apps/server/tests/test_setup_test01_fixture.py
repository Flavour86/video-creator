import json
import shutil
from pathlib import Path

import httpx
import pytest

from server.main import app


def _test01_source() -> Path:
    return Path(__file__).resolve().parents[3] / "projects" / "test01"


@pytest.mark.asyncio
async def test_setup_scaffold_and_inspect_test01_fixture(tmp_path: Path) -> None:
    source = _test01_source()
    if not source.is_dir():
        pytest.skip("projects/test01 fixture is not available in this checkout")

    project_dir = tmp_path / "test01"
    shutil.copytree(source, project_dir)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        scaffold = await client.post(
            "/setup/scaffold",
            json={"path": str(project_dir), "name": "test01", "output_preset": "final", "force": True},
        )
        first_inspect = await client.get("/setup/inspect", params={"path": str(project_dir)})
        second_inspect = await client.get("/setup/inspect", params={"path": str(project_dir)})

    assert scaffold.status_code == 200
    assert first_inspect.status_code == 200
    payload = first_inspect.json()
    assert payload["voice"]["path"].endswith("voice.mp3")
    assert payload["voice"]["state"] == "copied"
    assert payload["voice"]["duration"] > 0
    assert payload["transcript"]["state"] == "parsed"
    assert payload["transcript"]["sentence_count"] >= 20
    assert payload["alignment"]["hash"]
    assert payload["alignment"]["hash"] == second_inspect.json()["alignment"]["hash"]

    media_names = {path.name for path in (project_dir / "media").iterdir()}
    assert media_names == set()
    assert (project_dir / "bg0.png").is_file()
    assert (project_dir / "bg1.png").is_file()
    assert (project_dir / "bg2.png").is_file()
    assert (project_dir / "foreground.png").is_file()
    assert (project_dir / "PIP.png").is_file()

    project = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
    layer_kinds = {layer["kind"] for layer in project["layers"]}
    assert layer_kinds == {"sub"}
