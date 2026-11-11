from app.main import app


def test_normalize_endpoint_supports_version_selection_and_preview() -> None:
    openapi = app.openapi()
    operation = openapi["paths"]["/api/v1/datasets/{dataset_id}/normalize"]["post"]

    assert "requestBody" not in operation
    query_parameters = {
        parameter["name"]: parameter
        for parameter in operation["parameters"]
        if parameter["in"] == "query"
    }
    assert query_parameters["version_id"]["required"] is False
    assert query_parameters["page"]["schema"]["default"] == 1
    assert query_parameters["page_size"]["schema"]["default"] == 20
    assert query_parameters["page_size"]["schema"]["maximum"] == 100
    response_schema_ref = operation["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    result_schema = openapi["components"]["schemas"][response_schema_ref.rsplit("/", 1)[-1]]
    assert {
        "source_version_tag",
        "source_session_count",
        "source_session_ids",
        "preview",
    }.issubset(result_schema["properties"])


def test_normalized_validation_endpoint_is_removed() -> None:
    assert "/api/v1/datasets/{dataset_id}/normalize/validate" not in app.openapi()["paths"]


def test_export_request_does_not_include_quality_check_id() -> None:
    openapi = app.openapi()
    operation = openapi["paths"]["/api/v1/datasets/{dataset_id}/export"]["post"]
    request_schema_ref = operation["requestBody"]["content"]["application/json"]["schema"]["$ref"]
    request_schema = openapi["components"]["schemas"][request_schema_ref.rsplit("/", 1)[-1]]
    assert "quality_check_id" not in request_schema.get("properties", {})


def test_dataset_version_responses_include_dataset_and_session_provenance() -> None:
    openapi = app.openapi()
    response_paths = {
        ("/api/v1/datasets/{dataset_id}/versions/{version_id}/report", "get"),
        ("/api/v1/datasets/{dataset_id}/versions/{version_id}/status", "get"),
        ("/api/v1/datasets/{dataset_id}/versions/{version_id}/submit", "post"),
        ("/api/v1/datasets/{dataset_id}/versions/{version_id}/resubmit", "post"),
    }
    required_fields = {"source_version_id", "source_session_count", "source_sessions"}
    for path, method in response_paths:
        operation = openapi["paths"][path][method]
        assert operation["tags"] == ["Data Engineer"]
        response_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        response = openapi["components"]["schemas"][response_ref.rsplit("/", 1)[-1]]
        assert required_fields.issubset(response["properties"])

    for path in ("/api/v1/datasets/versions", "/api/v1/datasets/{dataset_id}/versions"):
        operation = openapi["paths"][path]["get"]
        item_ref = operation["responses"]["200"]["content"]["application/json"]["schema"]["items"]["$ref"]
        item = openapi["components"]["schemas"][item_ref.rsplit("/", 1)[-1]]
        assert {"dataset_name", *required_fields, "file_format", "total_records"}.issubset(item["properties"])
