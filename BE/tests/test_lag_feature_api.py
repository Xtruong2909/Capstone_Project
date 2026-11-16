from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.main import app
from app.services import lag_feature_service


def test_lag_generation_routes_are_documented() -> None:
    paths = app.openapi()["paths"]
    assert "/api/lag-features/generate" in paths
    for suffix in ("", "/sessions", "/preview", "/summary"):
        assert f"/api/lag-features/{{feature_generation_id}}{suffix}" in paths
    assert "/api/model-training/lag-features" not in paths
    assert "/api/predictions" not in paths
    preview_parameters = {
        parameter["name"]: parameter
        for parameter in paths["/api/lag-features/{feature_generation_id}/preview"]["get"]["parameters"]
    }
    assert "days_per_page" in preview_parameters
    assert "/api/lag-features/aggregations/{aggregation_id}/latest" in paths


def test_latest_features_restore_saved_generation_and_check_access(monkeypatch) -> None:
    aggregation_id = uuid4()
    generation_id = uuid4()
    checked = []
    generation = SimpleNamespace(
        id=generation_id, aggregation_id=aggregation_id, status="COMPLETED",
        configuration={}, sample_count=12, error_message=None,
    )
    monkeypatch.setattr(
        lag_feature_service, "get_accessible_temporal_jobs",
        lambda _db, _user, selected_id: checked.append(selected_id),
    )
    monkeypatch.setattr(
        lag_feature_service.repo, "get_latest_generation",
        lambda _db, selected_id: generation if selected_id == aggregation_id else None,
    )

    result = lag_feature_service.get_latest_generation_status(None, None, aggregation_id)

    assert checked == [aggregation_id]
    assert result.feature_generation_id == generation_id
    assert result.sample_count == 12

    monkeypatch.setattr(
        lag_feature_service, "get_accessible_temporal_jobs",
        lambda *_: (_ for _ in ()).throw(HTTPException(403, "Forbidden")),
    )
    with pytest.raises(HTTPException) as error:
        lag_feature_service.get_latest_generation_status(None, None, aggregation_id)
    assert error.value.status_code == 403


def test_persistent_splits_have_a_separate_swagger_group() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    assert "/api/train-test-splits" in paths
    assert "/api/train-test-splits/{split_id}" in paths
    assert "/api/train-test-splits/feature-generations/{feature_generation_id}/latest" in paths
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
    assert "LagForestTrainingRequest" not in schema["components"]["schemas"]
