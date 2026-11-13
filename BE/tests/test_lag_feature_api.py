from app.main import app


def test_lag_generation_and_vehicle_prediction_routes_are_documented() -> None:
    paths = app.openapi()["paths"]
    assert "/api/lag-features/generate" in paths
    for suffix in ("", "/sessions", "/preview", "/summary"):
        assert f"/api/lag-features/{{feature_generation_id}}{suffix}" in paths
    assert "/api/model-training/lag-features" in paths
    assert "/api/predictions" in paths


def test_persistent_splits_have_a_separate_swagger_group() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    assert "/api/train-test-splits" in paths
    assert "/api/train-test-splits/{split_id}" in paths
    assert "/api/train-test-splits/{split_id}/preview" in paths
    for path in (
        "/api/train-test-splits",
        "/api/train-test-splits/{split_id}",
        "/api/train-test-splits/{split_id}/preview",
    ):
        for operation in paths[path].values():
            assert operation["tags"] == ["Train/Test Split"]

    preview_parameters = {
        parameter["name"]: parameter
        for parameter in paths["/api/train-test-splits/{split_id}/preview"]["get"]["parameters"]
    }
    assert {"subset", "page", "page_size", "session_id"} <= preview_parameters.keys()
    assert preview_parameters["subset"]["required"] is True
    assert preview_parameters["subset"]["schema"]["enum"] == ["TRAIN", "TEST"]
    training_schema = schema["components"]["schemas"]["LagForestTrainingRequest"]
    assert "split_id" in training_schema["properties"]
