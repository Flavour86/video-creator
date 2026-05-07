import httpx
import pytest

from server.main import app


@pytest.mark.asyncio
async def test_create_project(tmp_path) -> None:
    target = tmp_path / "newproj"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json={"path": str(target), "name": "Test"})
    assert response.status_code == 200
    assert (target / "project.json").exists()
    assert (target / "media").is_dir()
    assert (target / "renders").is_dir()
    assert (target / ".vc").is_dir()


@pytest.mark.asyncio
async def test_create_project_rejects_non_empty_directory(tmp_path) -> None:
    target = tmp_path / "newproj"
    target.mkdir()
    (target / "existing.txt").write_text("x", encoding="utf-8")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json={"path": str(target), "name": "Test"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NOT_EMPTY"
