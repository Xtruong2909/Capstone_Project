from app.main import app


def test_normalize_endpoint_uses_dataset_id_and_returns_preview() -> None:
    operation = app.openapi()["paths"]["/api/v1/datasets/{dataset_id}/normalize"]["post"]

    assert "requestBody" not in operation
    query_parameters = {
        parameter["name"]: parameter
        for parameter in operation["parameters"]
        if parameter["in"] == "query"
    }
    assert query_parameters["page"]["schema"]["default"] == 1
    assert query_parameters["page_size"]["schema"]["default"] == 20
    assert query_parameters["page_size"]["schema"]["maximum"] == 100
    response_schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    result_schema = app.openapi()["components"]["schemas"][response_schema["$ref"].rsplit("/", 1)[-1]]
    assert "preview" in result_schema["properties"]

    preview_schema_ref = result_schema["properties"]["preview"]["$ref"]
    preview_schema = app.openapi()["components"]["schemas"][preview_schema_ref.rsplit("/", 1)[-1]]
    assert {
        "representation",
        "columns",
        "rows",
        "pagination",
    }.issubset(preview_schema["properties"])


def test_normalized_validation_endpoint_returns_requested_result_shape() -> None:
    operation = app.openapi()["paths"][
        "/api/v1/datasets/{dataset_id}/normalize/validate"
    ]["post"]
    response_schema_ref = operation["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    response_schema = app.openapi()["components"]["schemas"][
        response_schema_ref.rsplit("/", 1)[-1]
    ]

    assert operation["summary"].startswith("[Bước 4.2]")
    assert {
        "dataset_id",
        "validation_status",
        "total_rows",
        "valid_rows",
        "invalid_rows",
        "validation_results",
    }.issubset(response_schema["properties"])
