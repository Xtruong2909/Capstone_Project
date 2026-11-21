"""The upload helper changes Swagger's file picker without changing the API."""

from fastapi.testclient import TestClient

from app.main import app


def test_swagger_docs_includes_upload_dropzone_script() -> None:
    with TestClient(app) as client:
        docs = client.get("/docs")
        script = client.get("/docs/upload-dropzone.js")
        openapi = client.get("/api/v1/openapi.json")

    assert docs.status_code == 200
    assert '/docs/upload-dropzone.js' in docs.text
    assert script.status_code == 200
    assert "Kéo thả nhiều file CSV" in script.text
    assert openapi.status_code == 200
    assert "/api/v1/datasets/upload" in openapi.json()["paths"]
    assert "/docs/upload-dropzone.js" not in openapi.json()["paths"]
