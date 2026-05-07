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


@pytest.mark.asyncio
async def test_recent_open_and_remove_project(monkeypatch, tmp_path) -> None:
    from server.settings import settings

    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    target = tmp_path / "newproj"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/projects", json={"path": str(target), "name": "Test"}
        )
        assert create_response.status_code == 200

        recent_response = await client.get("/projects/recent")
        assert recent_response.status_code == 200
        assert recent_response.json()[0]["name"] == "Test"

        open_response = await client.post("/projects/open", json={"path": str(target)})
        assert open_response.status_code == 200
        assert open_response.json()["path"] == str(target)

        remove_response = await client.request(
            "DELETE", "/projects/recent", json={"path": str(target)}
        )
        assert remove_response.status_code == 200
        assert (await client.get("/projects/recent")).json() == []
