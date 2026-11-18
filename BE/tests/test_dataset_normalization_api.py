from app.main import app


def test_normalize_endpoint_supports_version_selection_and_preview() -> None:
    openapi = app.openapi()
    path = "/api/v1/datasets/groups/{group_id}/normalize"
    operation = openapi["paths"][path]["post"]
    assert operation["tags"] == ["Bước 4: Chuẩn hóa Dataset"]
    assert "requestBody" not in operation
    assert [(p["name"], p["in"]) for p in operation["parameters"]] == [("group_id", "path")]
    assert "202" in operation["responses"]
    response_ref = operation["responses"]["202"]["content"]["application/json"]["schema"]["$ref"]
    response_schema = openapi["components"]["schemas"][response_ref.rsplit("/", 1)[-1]]
    assert "staging_id" in response_schema["properties"]
    item_ref = response_schema["properties"]["results"]["items"]["$ref"]
    item_schema = openapi["components"]["schemas"][item_ref.rsplit("/", 1)[-1]]
    assert "staging_id" not in item_schema["properties"]


def test_normalized_validation_endpoint_is_removed() -> None:
    assert "/api/v1/datasets/{dataset_id}/normalize/validate" not in app.openapi()["paths"]


def test_export_request_does_not_include_quality_check_id() -> None:
    openapi = app.openapi()
    operation = openapi["paths"]["/api/v1/datasets/groups/{group_id}/export"]["post"]
    assert operation["tags"] == ["Bước 4: Chuẩn hóa Dataset"]
    assert "requestBody" not in operation
    assert [(p["name"], p["in"]) for p in operation["parameters"]] == [("group_id", "path")]
    assert "/api/v1/datasets/{dataset_id}/normalize" not in openapi["paths"]
    assert "/api/v1/datasets/{dataset_id}/export" not in openapi["paths"]
    assert "/api/v1/datasets/groups/{group_id}/processing-jobs/{job_id}" in openapi["paths"]


def test_dataset_version_responses_include_dataset_and_session_provenance() -> None:
    openapi = app.openapi()
    base = "/api/v1/datasets/groups/{group_id}"
    for suffix, method in (
        ("/versions", "get"), ("/report", "get"), ("/status", "get"),
        ("/submit", "post"), ("/resubmit", "post"),
    ):
        operation = openapi["paths"][base + suffix][method]
        assert operation["tags"] == ["Bước 5: Phiên bản & phê duyệt Dataset"]
        assert ("group_id", "path") in [
            (parameter["name"], parameter["in"]) for parameter in operation["parameters"]
        ]
        response_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        response = openapi["components"]["schemas"][response_ref.rsplit("/", 1)[-1]]
        assert "group_id" in response["properties"]
        if suffix == "/resubmit":
            assert "requestBody" not in operation

    submit = openapi["paths"][base + "/submit"]["post"]
    request_body = submit["requestBody"]
    assert request_body.get("required") is not True
    body_schema = request_body["content"]["application/json"]["schema"]
    submit_ref = next(item["$ref"] for item in body_schema["anyOf"] if "$ref" in item)
    submit_schema = openapi["components"]["schemas"][submit_ref.rsplit("/", 1)[-1]]
    assert "comment" in submit_schema["properties"]
    assert submit_schema["example"]["comment"]

    for old_path in (
        "/api/v1/datasets/versions",
        "/api/v1/datasets/{dataset_id}/versions",
        "/api/v1/datasets/{dataset_id}/versions/{version_id}/report",
        "/api/v1/datasets/{dataset_id}/versions/{version_id}/status",
        "/api/v1/datasets/{dataset_id}/versions/{version_id}/submit",
        "/api/v1/datasets/{dataset_id}/versions/{version_id}/resubmit",
    ):
        assert old_path not in openapi["paths"]
