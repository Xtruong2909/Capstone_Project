from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints.train_test_split import split_training
from app.main import app
from app.schemas.feature_engineering import TrafficObservation
from app.schemas.train_test_split import TrainTestSplitRequest
from app.services import train_test_split_service as service
from app.services.feature_engineering_service import build_training_features

VERSION = uuid4()
START = datetime(2018, 10, 24, 10, tzinfo=UTC)


def request_data(count: int = 5, strategy: str = "chronological") -> dict:
    # Synthetic fixtures only: exercise the actual FE contract; never production data.
    observations = [TrafficObservation(
        dataset_version_id=VERSION, recording_session_id=str(VERSION),
        time_bucket=START + timedelta(minutes=i), traffic_flow=100 + i,
    ) for i in range(count + 9)]
    samples = build_training_features(observations)
    return {
        "dataset_version_id": str(VERSION), "recording_session_id": str(VERSION),
        "split_strategy": strategy,
        "samples": [sample.model_dump(mode="json") for sample in samples],
    }


def test_five_samples_split_three_two_without_warning_fields() -> None:
    payload = TrainTestSplitRequest.model_validate(request_data())
    before = payload.model_dump()
    result = service.split_training_samples(payload)
    assert (result.total_samples, result.train_count, result.test_count) == (5, 3, 2)
    assert result.X_train == [sample.x for sample in payload.samples[:3]]
    assert result.y_test == [sample.y for sample in payload.samples[3:]]
    assert result.train_times == [sample.time_bucket for sample in payload.samples[:3]]
    assert result.test_target_times == [sample.target_times for sample in payload.samples[3:]]
    assert not result.official_evaluation_eligible
    assert "warnings" not in result.model_dump()
    assert "temporal_overlap_warning" not in result.model_dump()
    assert payload.model_dump() == before


def test_five_samples_safe_split_fails_explicitly() -> None:
    with pytest.raises(HTTPException) as error:
        service.split_training_samples(TrainTestSplitRequest.model_validate(request_data(strategy="purged_chronological")))
    assert error.value.status_code == 422
    assert error.value.detail["code"] == "INSUFFICIENT_SAFE_SPLIT_DATA"
    assert error.value.detail["purged_count"] == 3


def test_safe_split_purges_all_overlapping_targets_and_history() -> None:
    payload = TrainTestSplitRequest.model_validate(request_data(30, "purged_chronological"))
    result = service.split_training_samples(payload)
    assert (result.initial_train_count, result.train_count, result.test_count, result.purged_count) == (21, 12, 9, 9)
    assert result.train_count + result.test_count + result.purged_count == result.total_samples
    assert max(t.target_h5 for t in result.train_target_times) < min(result.test_history_start_times)
    assert result.official_evaluation_eligible
    assert "temporal_overlap_warning" not in result.model_dump()
    assert result.X_test == [sample.x for sample in payload.samples[21:]]


def test_shuffled_input_is_sorted_and_ratio_is_configurable() -> None:
    data = request_data()
    data["samples"].reverse()
    data["train_ratio"] = 0.4
    result = service.split_training_samples(TrainTestSplitRequest.model_validate(data))
    assert (result.train_count, result.test_count) == (2, 3)
    assert result.train_times + result.test_times == sorted(result.train_times + result.test_times)


def test_disjoint_time_windows_are_safe_without_purge() -> None:
    data = request_data(30)
    data["samples"] = data["samples"][:3] + data["samples"][-2:]
    result = service.split_training_samples(TrainTestSplitRequest.model_validate(data))
    assert result.official_evaluation_eligible
    assert result.purged_count == 0


@pytest.mark.parametrize("ratio", [0, 1, -0.1, 1.1, float("nan"), float("inf")])
def test_bad_ratio(ratio: float) -> None:
    data = request_data()
    data["train_ratio"] = ratio
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(data)


@pytest.mark.parametrize("count", [0, 1])
def test_empty_or_single_sample(count: int) -> None:
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(request_data(count))


def test_ratio_leaves_empty_train() -> None:
    data = request_data()
    data["train_ratio"] = 0.01
    with pytest.raises(HTTPException, match="floor"):
        service.split_training_samples(TrainTestSplitRequest.model_validate(data))


@pytest.mark.parametrize("field", ["features", "targets", "target_times", "x", "y"])
def test_missing_fields(field: str) -> None:
    data = request_data()
    del data["samples"][0][field]
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(data)


@pytest.mark.parametrize("field,value", [("dataset_version_id", str(uuid4())), ("roi_identifier", "OTHER"), ("recording_session_id", "other-session")])
def test_mixed_scope_rejected(field: str, value: str) -> None:
    data = request_data()
    data["samples"][0][field] = value
    with pytest.raises(HTTPException, match="session"):
        service.split_training_samples(TrainTestSplitRequest.model_validate(data))


@pytest.mark.parametrize("mutation", ["target_time", "naive", "history", "x", "y", "nan", "order", "missing_lag", "missing_target"])
def test_invalid_sample_metadata_or_values(mutation: str) -> None:
    data = request_data()
    sample = data["samples"][0]
    if mutation == "target_time":
        sample["target_times"]["target_h5"] = sample["target_times"]["target_h1"]
    elif mutation == "naive":
        sample["time_bucket"] = "2018-10-24T10:04:00"
    elif mutation == "history":
        sample["history_start_time"] = sample["time_bucket"]
    elif mutation in ("x", "y"):
        sample[mutation].reverse()
    elif mutation == "nan":
        sample["features"]["lag_1"] = float("nan")
    elif mutation == "order":
        data["feature_order"] = ["lag_5", "lag_4", "lag_3", "lag_2", "lag_1"]
    elif mutation == "missing_lag":
        del sample["features"]["lag_5"]
    else:
        del sample["targets"]["target_h3"]
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(data)


def test_duplicate_times_and_id_only_rejected() -> None:
    data = request_data()
    data["samples"].append(data["samples"][0])
    with pytest.raises(HTTPException, match="Duplicate"):
        service.split_training_samples(TrainTestSplitRequest.model_validate(data))
    del data["samples"]
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(data)


def test_router_access_and_no_rebuild(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import feature_engineering_service

    rebuild = MagicMock(side_effect=AssertionError("Must not rebuild FE"))
    monkeypatch.setattr(feature_engineering_service, "prepare_features", rebuild)
    version = SimpleNamespace(id=VERSION, dataset_id=uuid4())
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: version)
    access = MagicMock()
    monkeypatch.setattr(service, "require_dataset_scientist", access)
    payload = TrainTestSplitRequest.model_validate(request_data())
    db = MagicMock()
    saved_id = uuid4()
    monkeypatch.setattr(service.crud_model_training, "save_split", MagicMock(return_value=SimpleNamespace(id=saved_id)))
    result = split_training(payload, db, MagicMock())
    assert result.split_id == saved_id
    assert result.train_count == 3
    assert access.call_args.kwargs["dataset_id"] == version.dataset_id
    rebuild.assert_not_called()
    db.commit.assert_called_once()
    access.side_effect = HTTPException(403, "Access denied")
    with pytest.raises(HTTPException) as error:
        split_training(payload, db, MagicMock())
    assert error.value.status_code == 403
    monkeypatch.setattr(service.crud_dataset_access, "get_version", lambda *_: None)
    with pytest.raises(HTTPException) as error:
        split_training(payload, db, MagicMock())
    assert error.value.status_code == 404


def test_swagger_paths_and_auth() -> None:
    paths = app.openapi()["paths"]
    assert "/api/feature-engineering/training" in paths
    operation = paths["/api/train-test-split/training"]["post"]
    assert operation["security"]
    assert operation["requestBody"]["required"]


def test_paste_complete_feature_response() -> None:
    from app.schemas.feature_engineering import TrainingFeatureResponse

    original = request_data()
    response = TrainingFeatureResponse(
        dataset_version_id=VERSION, roi_identifier="MAIN_ROI",
        sample_count=5, samples=original["samples"],
    ).model_dump(mode="json")
    payload = TrainTestSplitRequest.model_validate(response)
    assert payload.recording_session_id == str(VERSION)
    assert payload.train_ratio == 0.7
    result = service.split_training_samples(payload)
    assert (result.train_count, result.test_count) == (3, 2)
    assert not result.official_evaluation_eligible
    assert "recording_session_id" not in response


@pytest.mark.parametrize("invalid", ["count", "config", "mixed", "unknown"])
def test_pasted_response_still_validated(invalid: str) -> None:
    data = request_data()
    del data["recording_session_id"]
    if invalid == "count":
        data["sample_count"] = 999
    elif invalid == "config":
        data["configuration"] = {"lag_count": 6}
    elif invalid == "mixed":
        data["samples"][0]["recording_session_id"] = "another-session"
    else:
        data["train_rato"] = 0.8
    with pytest.raises(ValidationError):
        TrainTestSplitRequest.model_validate(data)
