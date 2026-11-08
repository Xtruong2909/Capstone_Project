from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints.feature_engineering import prediction_features, training_features
from app.main import app
from app.schemas.feature_engineering import FeatureRequest, TrafficObservation
from app.services import feature_engineering_service as service

VERSION = uuid4()
START = datetime(2018, 10, 24, 10, tzinfo=UTC)


def series(count: int = 15) -> list[TrafficObservation]:
    flows = [189, 175, 203, 197, 190, 192, 180, 170, 181, 178, 172, 195, 208, 195, 197]
    return [TrafficObservation(
        dataset_version_id=VERSION, recording_session_id="session-a",
        time_bucket=START + timedelta(minutes=i), traffic_flow=flows[i % len(flows)],
    ) for i in range(count)]


def test_training_example_and_sliding_window() -> None:
    samples = service.build_training_features(list(reversed(series())))
    assert len(samples) == 6
    first = samples[0]
    assert first.x == [190, 197, 203, 175, 189]
    assert list(first.features.model_dump()) == [f"lag_{i}" for i in range(1, 6)]
    assert list(first.features.model_dump().values()) == first.x
    assert first.y == [192, 170, 178]
    assert list(first.targets.model_dump().values()) == first.y
    assert first.time_bucket == START + timedelta(minutes=4)
    assert list(first.target_times.model_dump().values()) == [
        START + timedelta(minutes=i) for i in (5, 7, 9)
    ]
    assert first.history_start_time == START
    assert samples[1].x == [192, 190, 197, 203, 175]
    assert samples[1].time_bucket - first.time_bucket == timedelta(minutes=1)


def test_prediction_example_and_shared_order() -> None:
    prediction = service.build_prediction_features(list(reversed(series())))
    assert prediction.x == [197, 195, 208, 195, 172]
    assert prediction.target_times == [START + timedelta(minutes=i) for i in (15, 17, 19)]
    assert prediction.latest_time_bucket == START + timedelta(minutes=14)
    assert "targets" not in prediction.model_dump()
    assert "y" not in prediction.model_dump()
    history = service.build_prediction_features(series()[:5])
    assert history.features == service.build_training_features(series())[0].features


@pytest.mark.parametrize("missing", [0, 4, 5, 6, 8, 9])
def test_no_training_window_crosses_missing_minute(missing: int) -> None:
    rows = series(10)
    del rows[missing]
    assert service.build_training_features(rows) == []


def test_resume_after_gap_without_filling_zero() -> None:
    rows = series(25)
    del rows[10]
    samples = service.build_training_features(rows)
    assert [int((sample.time_bucket - START).total_seconds() / 60) for sample in samples] == [4, 15, 16, 17, 18, 19]


@pytest.mark.parametrize("field,value", [
    ("recording_session_id", "session-b"), ("dataset_version_id", uuid4()),
    ("roi_identifier", "OTHER_ROI"),
])
def test_never_cross_scope(field: str, value: object) -> None:
    rows = series(10)
    rows[5:] = [row.model_copy(update={field: value}) for row in rows[5:]]
    assert service.build_training_features(rows) == []
    with pytest.raises(ValueError, match="exactly one"):
        service.build_prediction_features(rows)


@pytest.mark.parametrize("count", [0, 1, 4])
def test_short_prediction(count: int) -> None:
    with pytest.raises(ValueError, match="five"):
        service.build_prediction_features(series(count))


@pytest.mark.parametrize("count", [0, 4, 5, 9])
def test_short_training(count: int) -> None:
    assert service.build_training_features(series(count)) == []


@pytest.mark.parametrize("value", [None, float("nan"), float("inf"), -1])
def test_unobserved_flow_breaks_window(value: float | None) -> None:
    rows = series(10)
    rows[6] = rows[6].model_copy(update={"traffic_flow": value})
    assert service.build_training_features(rows) == []
    with pytest.raises(ValueError):
        service.build_prediction_features(rows)


def test_zero_is_valid_and_latest_gap_does_not_fallback() -> None:
    rows = series(10)
    rows[4].traffic_flow = 0
    assert service.build_training_features(rows)[0].x[0] == 0
    del rows[8]
    with pytest.raises(ValueError, match="not continuous"):
        service.build_prediction_features(rows)


def test_reject_duplicates_and_nonfixed_config() -> None:
    with pytest.raises(ValueError, match="Duplicate"):
        service.build_training_features(series() + series()[:1])
    with pytest.raises(ValueError, match="lag_count"):
        service.build_prediction_features(series(), lag_count=4)
    with pytest.raises(ValueError, match="timezone"):
        service.build_training_features([series()[0].model_copy(update={"time_bucket": START.replace(tzinfo=None)})])


def test_api_and_repository_integration(monkeypatch: pytest.MonkeyPatch) -> None:
    version = SimpleNamespace(id=VERSION, dataset_id=uuid4(), original_filename="20181024_d1_0830_0900.csv")
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: version)
    access = MagicMock()
    monkeypatch.setattr(service, "require_dataset_scientist", access)
    read = MagicMock(return_value=series())
    monkeypatch.setattr(service.crud_feature_engineering, "read_feature_series", read)
    request = FeatureRequest(dataset_version_id=VERSION)
    db, user = MagicMock(), SimpleNamespace(role_id="data_scientist")
    training = training_features(request, db, user)
    assert training.sample_count == 6
    assert read.call_args.kwargs["latest_only"] is False
    prediction = prediction_features(request, db, user)
    assert prediction.x == [197, 195, 208, 195, 172]
    assert read.call_args.kwargs["latest_only"] is True
    assert access.call_args.kwargs["dataset_id"] == version.dataset_id
    read.return_value = []
    with pytest.raises(HTTPException) as error:
        prediction_features(request, db, user)
    assert error.value.status_code == 422
    with pytest.raises(ValidationError):
        FeatureRequest(dataset_version_id=VERSION, lag_count=6)
    access.side_effect = HTTPException(403, "Dataset access has not been granted")
    read.reset_mock()
    with pytest.raises(HTTPException) as error:
        training_features(request, db, user)
    assert error.value.status_code == 403
    read.assert_not_called()


def test_openapi_routes_require_authentication() -> None:
    for mode in ("training", "prediction"):
        operation = app.openapi()["paths"][f"/api/feature-engineering/{mode}"]["post"]
        assert operation["security"]
        assert operation["requestBody"]["required"]
        assert "200" in operation["responses"]


def test_roi_hidden_in_request_schema_but_defaults_and_compatibility_remain() -> None:
    schema = app.openapi()["components"]["schemas"]["FeatureRequest"]
    assert set(schema["properties"]) == {"dataset_version_id"}
    assert FeatureRequest(dataset_version_id=VERSION).roi_identifier == "MAIN_ROI"
    assert FeatureRequest(dataset_version_id=VERSION, roi_identifier="ROI-A").roi_identifier == "ROI-A"
    with pytest.raises(ValidationError):
        FeatureRequest(dataset_version_id=VERSION, roi_identifier="")


def test_missing_version_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: None)
    with pytest.raises(HTTPException) as error:
        service.prepare_features(MagicMock(), FeatureRequest(dataset_version_id=VERSION), MagicMock(), prediction=False)
    assert error.value.status_code == 404


@pytest.mark.parametrize("prediction", [False, True])
def test_repository_scope_and_latest_limit(monkeypatch: pytest.MonkeyPatch, prediction: bool) -> None:
    from app.crud import crud_feature_engineering as repo

    query = MagicMock()
    query.filter.return_value = query
    query.limit.return_value = query
    query.all.return_value = []
    factory = MagicMock(return_value=query)
    monkeypatch.setattr(repo, "traffic_time_query", factory)
    repo.read_feature_series(
        MagicMock(), version_id=VERSION, roi_identifier="ROI-A",
        recording_start=START, latest_only=prediction,
    )
    assert factory.call_args.kwargs["descending"] is prediction
    conditions = query.filter.call_args.args
    assert [condition.left.name for condition in conditions] == [
        "dataset_version_id", "roi_identifier", "aggregation_interval",
    ]
    assert [condition.right.value for condition in conditions] == [VERSION, "ROI-A", 60]
    if prediction:
        query.limit.assert_called_once_with(5)
    else:
        query.limit.assert_not_called()


def test_independent_sessions_with_overlapping_times() -> None:
    first = series(10)
    second = [row.model_copy(update={"recording_session_id": "b", "traffic_flow": 999}) for row in first]
    samples = service.build_training_features(first + second)
    assert len(samples) == 2
    assert {sample.recording_session_id for sample in samples} == {"session-a", "b"}
    assert next(sample for sample in samples if sample.recording_session_id == "b").x == [999] * 5


def test_adapter_rebases_legacy_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    version = SimpleNamespace(id=VERSION, dataset_id=uuid4(), original_filename="20181024_d1_0830_0900.csv")
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: version)
    monkeypatch.setattr(service, "require_dataset_scientist", MagicMock())
    rows = [row.model_copy(update={"time_bucket": datetime(1970, 1, 1, tzinfo=UTC) + timedelta(minutes=i)}) for i, row in enumerate(series(5))]
    monkeypatch.setattr(service.crud_feature_engineering, "read_feature_series", lambda *args, **kwargs: rows)
    result = service.prepare_features(
        MagicMock(), FeatureRequest(dataset_version_id=VERSION), MagicMock(), prediction=True,
    )
    assert result.latest_time_bucket == datetime(2018, 10, 24, 5, 34, tzinfo=UTC)


def test_non_scientist_cannot_read_features(monkeypatch: pytest.MonkeyPatch) -> None:
    version = SimpleNamespace(id=VERSION, dataset_id=uuid4())
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: version)
    with pytest.raises(HTTPException) as error:
        service.prepare_features(
            MagicMock(), FeatureRequest(dataset_version_id=VERSION),
            SimpleNamespace(role_id="business_user"), prediction=False,
        )
    assert error.value.status_code == 403
