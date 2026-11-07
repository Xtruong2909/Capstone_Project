from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sklearn.ensemble import RandomForestRegressor

from app.crud import crud_admin
from app.main import app
from app.models.model_training import ModelTrainingExperiment
from app.schemas.admin import ExperimentsOverviewResponse
from app.schemas.model_training import Hyperparameters, TrainingExperimentRequest, TrainingSplit
from app.services import model_training_service as service


def make_split(count: int = 10, gap: int = 0) -> TrainingSplit:
    start = datetime(2018, 10, 24, 6, 30, tzinfo=UTC)
    n_train = count * 7 // 10
    origins = [start + timedelta(minutes=4 + i + (gap if i >= n_train else 0))
               for i in range(count)]

    def flow(timestamp: datetime) -> float:
        minute = int((timestamp - start).total_seconds() // 60)
        return float(100 + minute * 2 + (minute % 3) * 4)

    x = [[flow(t - timedelta(minutes=i)) for i in range(5)] for t in origins]
    y = [[flow(t + timedelta(minutes=h)) for h in (1, 3, 5)] for t in origins]
    return TrainingSplit(
        dataset_version_id=uuid4(), roi_identifier="MAIN_ROI", recording_session_id="session-1",
        X_train=x[:n_train], X_test=x[n_train:], y_train=y[:n_train], y_test=y[n_train:],
        train_times=origins[:n_train], test_times=origins[n_train:],
    )


@pytest.mark.parametrize("count", [2, 5, 10])
def test_real_forest_baselines_and_consistent_tables(count: int) -> None:
    split = make_split(count)
    params = Hyperparameters(n_estimators=5, max_depth=3)
    result = service.train_models(split, params)
    assert result["training_time_sec"] > 0
    assert result["prediction_time_sec"] > 0
    assert len(result["prediction_rows"]) == len(split.X_test) * 9
    for column, horizon in enumerate((1, 3, 5)):
        expected_forest = RandomForestRegressor(**params.model_dump(), n_jobs=1).fit(
            split.X_train, np.array(split.y_train)[:, column]
        ).predict(split.X_test)
        for model in ("random_forest", "persistence", "historical_average"):
            rows = [r for r in result["prediction_rows"]
                    if r["model"] == model.upper() and r["horizon_minutes"] == horizon]
            for i, row in enumerate(rows):
                assert datetime.fromisoformat(row["forecast_origin_time"]) == split.test_times[i]
                assert datetime.fromisoformat(row["target_timestamp"]) == split.test_times[i] + timedelta(minutes=horizon)
                assert row["actual_traffic_flow"] == split.y_test[i][column]
                if model == "random_forest":
                    assert row["predicted_traffic_flow"] == expected_forest[i]
                elif model == "persistence":
                    assert row["predicted_traffic_flow"] == split.X_test[i][0]
                else:
                    assert row["predicted_traffic_flow"] == np.mean(np.array(split.y_train)[:, column])
            metrics = result["performance_by_horizon"][str(horizon)][model]
            assert metrics["mae"] == pytest.approx(np.mean([r["absolute_error"] for r in rows]))
            assert metrics["rmse"] == pytest.approx(np.sqrt(np.mean([r["squared_error"] for r in rows])))


def test_test_labels_do_not_affect_predictions_and_reproducibility() -> None:
    split = make_split(40, gap=20)
    params = Hyperparameters(n_estimators=5)
    first = service.train_models(split, params)
    # Deliberately mutate only labels after input validation to isolate training behavior.
    split.y_test = [[value + 50 for value in row] for row in split.y_test]
    second = service.train_models(split, params)
    assert [r["predicted_traffic_flow"] for r in first["prediction_rows"]] == [
        r["predicted_traffic_flow"] for r in second["prediction_rows"]
    ]


def test_three_result_tables_use_same_predictions_and_correct_metric_scope() -> None:
    split = make_split()
    result = service.train_models(split, Hyperparameters(n_estimators=3))
    tables = service.build_result_tables(list(reversed(result["prediction_rows"])))
    assert len(tables.horizon_forecasts) == 3
    assert len(tables.prediction_details) == 27
    assert len(tables.model_summary) == 3
    for row in tables.horizon_forecasts:
        assert row.forecast_origin_time == split.test_times[-1]
        assert row.target_timestamp == row.forecast_origin_time + timedelta(minutes=row.horizon_minutes)
        metrics = result["performance_by_horizon"][str(row.horizon_minutes)]["random_forest"]
        assert row.sample_count == 3
        assert row.rmse == pytest.approx(metrics["rmse"])
        assert row.mse == pytest.approx(metrics["rmse"] ** 2)
    for summary in tables.model_summary:
        matching = [row for row in tables.prediction_details if row.model == summary.model]
        assert summary.sample_count == 9
        expected_mse = sum(row.squared_error for row in matching) / 9
        assert summary.mse == pytest.approx(expected_mse)
        assert summary.rmse == pytest.approx(expected_mse ** 0.5)
        assert summary.mae == pytest.approx(sum(row.absolute_error for row in matching) / 9)
    assert service.build_result_tables([]).model_dump() == {
        "horizon_forecasts": [], "prediction_details": [], "model_summary": [],
    }


def test_eligibility_is_recomputed_not_client_flag() -> None:
    split = make_split()
    payload = split.model_dump(mode="json")
    payload["official_evaluation_eligible"] = True
    result = service.evaluate_validity(TrainingSplit.model_validate(payload), "exploratory")
    assert not result["official_evaluation_eligible"]
    assert "warnings" not in result
    assert "min-test" not in result["evaluation_policy"]
    with pytest.raises(HTTPException) as error:
        service.evaluate_validity(split, "official")
    assert error.value.status_code == 422
    assert "warnings" not in error.value.detail
    assert service.evaluate_validity(make_split(40, gap=20), "official")["official_evaluation_eligible"]
    assert service.evaluate_validity(make_split(10, gap=20), "official")["official_evaluation_eligible"]


def test_old_experiment_hides_warnings_without_promoting_eligibility() -> None:
    split = make_split()
    request = TrainingExperimentRequest(dataset_version_id=split.dataset_version_id, split_result=split)
    experiment = SimpleNamespace(
        id=uuid4(), name="Ex-001", split_id=uuid4(), configuration=request.model_dump(mode="json"),
        status="COMPLETED", training_time_sec=0.1, prediction_time_sec=0.01, execution_time_sec=0.2,
        evaluation={"evaluation_mode": "exploratory", "official_evaluation_eligible": False,
                    "evaluation_policy": "traffic-v1:min-test=10", "warnings": ["Only 3 test samples"]},
        performance_by_horizon={}, prediction_rows=[], library_versions={}, error=None,
        created_at=datetime.now(UTC),
    )
    result = service.serialize_experiment(experiment).model_dump()
    assert "warnings" not in result
    assert result["official_evaluation_eligible"] is False
    assert result["evaluation_policy"] == experiment.evaluation["evaluation_policy"]
    assert "warnings" in experiment.evaluation  # No database rewrite.
    schema = app.openapi()["components"]["schemas"]["TrainingExperimentResponse"]
    assert "warnings" not in schema["properties"]


@pytest.mark.parametrize("mutation", ["length", "width", "order", "nan", "negative", "time", "target", "history", "conflict", "ratio"])
def test_split_validation(mutation: str) -> None:
    data = make_split().model_dump(mode="json")
    if mutation == "length":
        data["y_train"].pop()
    elif mutation == "width":
        data["X_train"][0].pop()
    elif mutation == "order":
        data["feature_order"].reverse()
    elif mutation in ("nan", "negative"):
        data["X_train"][0][0] = float("nan") if mutation == "nan" else -1
    elif mutation == "time":
        data["test_times"][0] = data["train_times"][0]
    elif mutation == "target":
        data["train_target_times"][0]["target_h1"] = data["train_times"][0]
    elif mutation == "history":
        data["train_history_start_times"][0] = data["train_times"][0]
    elif mutation == "conflict":
        data["X_train"][1][1] += 1
    else:
        data["train_ratio"] = 0.8
    with pytest.raises(ValidationError):
        TrainingSplit.model_validate(data)


@pytest.mark.parametrize("features", [0, 6, 1.2, True, "auto", float("nan")])
def test_invalid_hyperparameters(features: object) -> None:
    with pytest.raises(ValidationError):
        Hyperparameters(max_features=features)


def test_request_and_fingerprint() -> None:
    split = make_split()
    with pytest.raises(ValidationError):
        TrainingExperimentRequest(dataset_version_id=split.dataset_version_id)
    with pytest.raises(ValidationError):
        TrainingExperimentRequest(dataset_version_id=uuid4(), split_result=split)
    payload = split.model_dump(mode="json")
    payload["warnings"] = ["untrusted"]
    assert service.split_fingerprint(split) == service.split_fingerprint(TrainingSplit.model_validate(payload))


def test_query_supplies_dataset_id_and_rejects_mismatched_pasted_id() -> None:
    from app.schemas.model_training import TrainingSplitInput

    split = make_split()
    data = split.model_dump(exclude={"dataset_version_id"})
    body = TrainingSplitInput.model_validate(data)
    request = service.build_parameter_request(
        split.dataset_version_id, None, body, {"max_features": "1.0"}, "exploratory",
    )
    assert request.split_result == split
    assert "dataset_version_id" not in TrainingSplitInput.model_json_schema()["properties"]
    data["dataset_version_id"] = uuid4()
    with pytest.raises(HTTPException) as error:
        service.build_parameter_request(
            split.dataset_version_id, None, TrainingSplitInput.model_validate(data),
            {"max_features": "1.0"}, "exploratory",
        )
    assert error.value.status_code == 422


def test_body_without_id_still_checks_alignment() -> None:
    from app.schemas.model_training import TrainingSplitInput

    split = make_split()
    data = split.model_dump(exclude={"dataset_version_id"})
    data["y_test"].pop()
    with pytest.raises(HTTPException) as error:
        service.build_parameter_request(
            split.dataset_version_id, None, TrainingSplitInput.model_validate(data),
            {"max_features": "1.0"}, "exploratory",
        )
    assert error.value.status_code == 422


@pytest.mark.parametrize("features,expected", [("1.0", 1.0), ("3", 3), ("sqrt", "sqrt"), ("null", None)])
def test_query_parameters_and_reused_split(features: str, expected: object) -> None:
    split = make_split()
    params = {**Hyperparameters().model_dump(), "max_features": features}
    request = service.build_parameter_request(
        split.dataset_version_id, None, split, params, "exploratory",
    )
    assert request.split_result == split
    assert request.hyperparameters.max_features == expected
    saved_id = uuid4()
    reused = service.build_parameter_request(split.dataset_version_id, saved_id, None, params, "exploratory")
    assert reused.split_id == saved_id
    assert reused.split_result is None


def test_parameters_require_exactly_one_source_and_valid_configuration() -> None:
    split = make_split()
    for split_id, content in [(None, None), (uuid4(), split)]:
        with pytest.raises(HTTPException) as error:
            service.build_parameter_request(split.dataset_version_id, split_id, content, {"max_features": "1.0"}, "exploratory")
        assert error.value.status_code == 422
    for features in ["invalid", "true", "0", "1.5"]:
        with pytest.raises(HTTPException) as error:
            service.build_parameter_request(split.dataset_version_id, uuid4(), None, {"max_features": features}, "exploratory")
        assert error.value.status_code == 422


def test_swagger_has_query_inputs_and_no_upload_endpoint() -> None:
    document = app.openapi()
    assert "/api/model-training/experiment/form" not in document["paths"]
    operation = document["paths"]["/api/model-training/experiment"]["post"]
    fields = {p["name"]: p for p in operation["parameters"]}
    assert {"split_id", "n_estimators", "max_depth", "max_features",
            "min_samples_split", "min_samples_leaf", "bootstrap", "random_state", "evaluation_mode"} == fields.keys()
    assert all(p["in"] == "query" for p in fields.values())
    assert fields["max_depth"]["schema"]["minimum"] == 0
    assert fields["split_id"]["required"]
    assert "requestBody" not in operation
    assert operation["security"]


def test_training_by_id_resolves_dataset_and_missing_id(monkeypatch: pytest.MonkeyPatch) -> None:
    stored = SimpleNamespace(id=uuid4(), dataset_version_id=uuid4())
    monkeypatch.setattr(service.repository, "get_split", lambda *args: stored)
    run = MagicMock()
    monkeypatch.setattr(service, "create_and_run", run)
    db, user = MagicMock(), MagicMock()
    service.create_from_saved_split(db, stored.id, {"max_features": "1.0"}, "exploratory", user)
    request = run.call_args.args[1]
    assert request.dataset_version_id == stored.dataset_version_id
    assert request.split_id == stored.id
    assert request.split_result is None
    monkeypatch.setattr(service.repository, "get_split", lambda *args: None)
    with pytest.raises(HTTPException) as error:
        service.create_from_saved_split(db, uuid4(), {"max_features": "1.0"}, "exploratory", user)
    assert error.value.status_code == 404


def test_failed_training_is_persisted(monkeypatch: pytest.MonkeyPatch) -> None:
    split = make_split()
    stored = SimpleNamespace(id=uuid4())
    experiment = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(service, "require_version", lambda *a, **kw: None)
    monkeypatch.setattr(service.repository, "save_split", lambda *a: stored)
    monkeypatch.setattr(service.repository, "create_experiment", lambda *a: experiment)
    update = MagicMock()
    monkeypatch.setattr(service.repository, "update_experiment", update)
    monkeypatch.setattr(service, "train_models", MagicMock(side_effect=RuntimeError("failure")))
    monkeypatch.setattr(service, "serialize_experiment", lambda exp: exp)
    service.create_and_run(MagicMock(), TrainingExperimentRequest(
        dataset_version_id=split.dataset_version_id, split_result=split,
    ), SimpleNamespace(id=uuid4()))
    assert update.call_args_list[0].kwargs["status"] == "RUNNING"
    assert update.call_args_list[1].kwargs["status"] == "FAILED"
    assert update.call_args_list[1].kwargs["execution_time_sec"] > 0
    assert update.call_args_list[1].kwargs["logs"][-1]["level"] == "ERROR"


def test_training_logs_are_persisted_with_status_transitions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split = make_split()
    stored = SimpleNamespace(id=uuid4())
    experiment = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(service, "require_version", lambda *a, **kw: None)
    monkeypatch.setattr(service.repository, "save_split", lambda *a: stored)
    monkeypatch.setattr(service.repository, "create_experiment", lambda *a: experiment)
    updates = []
    monkeypatch.setattr(
        service.repository,
        "update_experiment",
        lambda _db, _experiment, **values: updates.append({
            **values,
            "logs": list(values["logs"]) if "logs" in values else None,
        }),
    )

    def fake_train(_split, _parameters, progress):
        progress("Training Random Forest for the 1-minute forecast horizon.")
        return {
            "training_time_sec": 0.1,
            "prediction_time_sec": 0.01,
            "performance_by_horizon": {},
            "prediction_rows": [],
            "library_versions": {},
        }

    train = MagicMock(side_effect=fake_train)
    monkeypatch.setattr(service, "train_models", train)
    monkeypatch.setattr(service, "serialize_experiment", lambda exp: exp)

    service.create_and_run(
        MagicMock(),
        TrainingExperimentRequest(dataset_version_id=split.dataset_version_id, split_result=split),
        SimpleNamespace(id=uuid4()),
    )

    assert updates[0]["status"] == "RUNNING"
    assert [entry["message"] for entry in updates[0]["logs"]] == [
        "Dataset access validated and experiment created.",
        (
            f"Chronological split loaded: {len(split.X_train)} training rows, "
            f"{len(split.X_test)} test rows; evaluation mode=exploratory."
        ),
        "Training started.",
    ]
    assert updates[-1]["status"] == "COMPLETED"
    assert updates[-1]["logs"][-2]["message"] == (
        "Training Random Forest for the 1-minute forecast horizon."
    )
    assert updates[-1]["logs"][-1]["message"] == "Training completed successfully."
    assert updates[-1]["logs"][-1]["level"] == "INFO"


def test_admin_experiment_overview_includes_training_status_and_logs() -> None:
    experiment_id = uuid4()
    created_at = datetime.now(UTC)
    persisted_logs = [{
        "timestamp": created_at.isoformat(),
        "level": "INFO",
        "message": "Training started.",
    }]
    training = SimpleNamespace(
        id=experiment_id,
        name="Ex-001",
        configuration={"model": "RANDOM_FOREST", "hyperparameters": {"n_estimators": 25}},
        status="RUNNING",
        execution_time_sec=None,
        performance_by_horizon={},
        created_at=created_at,
        split_id=uuid4(),
        evaluation={"evaluation_mode": "official"},
        logs=persisted_logs,
    )

    class QueryStub:
        def __init__(self, entities):
            self.entities = entities
            self.status = None

        def filter(self, condition):
            self.status = condition.right.value
            return self

        def join(self, *_args):
            return self

        def outerjoin(self, *_args):
            return self

        def count(self):
            return int(
                self.entities[0] is ModelTrainingExperiment
                and (self.status is None or self.status == "RUNNING")
            )

        def order_by(self, *_args):
            return self

        def limit(self, _limit):
            return self

        def all(self):
            if self.entities[0] is ModelTrainingExperiment and len(self.entities) > 1:
                return [(training, "Data Scientist", "v2", "Traffic"),]
            return []

    class DbStub:
        def query(self, *entities):
            return QueryStub(entities)

    data = crud_admin.get_experiments_overview_data(DbStub())
    response = ExperimentsOverviewResponse.model_validate(data)

    assert response.stats.total_experiments == 1
    assert response.stats.running_count == 1
    assert response.experiments[0].experiment_type == "MODEL_TRAINING"
    assert response.experiments[0].logs[0].message == "Training started."
    assert response.experiments[0].hyperparameters == {"n_estimators": 25}


def test_access_denied_prevents_training(monkeypatch: pytest.MonkeyPatch) -> None:
    check = MagicMock(side_effect=HTTPException(403, "denied"))
    monkeypatch.setattr(service, "require_version", check)
    train = MagicMock()
    monkeypatch.setattr(service, "train_models", train)
    split = make_split()
    with pytest.raises(HTTPException):
        service.create_and_run(MagicMock(), TrainingExperimentRequest(
            dataset_version_id=split.dataset_version_id, split_result=split,
        ), SimpleNamespace(id=uuid4()))
    train.assert_not_called()


def test_model_training_routes_replace_legacy_routes() -> None:
    paths = app.openapi()["paths"]
    for path in ("/api/model-training/experiment", "/api/model-training/experiments",
                 "/api/model-training/experiments/compare", "/api/model-training/experiments/{experiment_id}"):
        assert next(iter(paths[path].values()))["security"]
    assert not any(path.startswith("/api/v1/experiments") for path in paths)


@pytest.mark.parametrize("field", ["split_id", "dataset_version_id", "evaluation_policy", "evaluation_mode", "status"])
def test_incompatible_comparisons_rejected(monkeypatch: pytest.MonkeyPatch, field: str) -> None:
    common = {"dataset_version_id": uuid4(), "split_id": uuid4(), "evaluation_policy": "v1",
              "evaluation_mode": "exploratory", "forecast_horizons": [1, 3, 5], "status": "COMPLETED"}
    first = SimpleNamespace(**common)
    second = SimpleNamespace(**common)
    setattr(second, field, uuid4() if field.endswith("id") else "different")
    monkeypatch.setattr(service, "get_detail", MagicMock(side_effect=[first, second]))
    with pytest.raises(HTTPException):
        service.compare_results(MagicMock(), [uuid4(), uuid4()], MagicMock())


def test_compare_saved_metrics_winners_ties_and_test_alignment(monkeypatch: pytest.MonkeyPatch) -> None:
    from copy import deepcopy

    split = make_split()
    trained = service.train_models(split, Hyperparameters(n_estimators=3))
    from app.schemas.model_training import Metric, Prediction
    first = SimpleNamespace(
        experiment_id=uuid4(), experiment_name="Ex-004", dataset_version_id=split.dataset_version_id,
        split_id=uuid4(), evaluation_policy=service.EVALUATION_POLICY, evaluation_mode="exploratory",
        forecast_horizons=[1, 3, 5], status="COMPLETED", hyperparameters=Hyperparameters(),
        training_time_sec=0.2, prediction_time_sec=0.01,
        prediction_rows=[Prediction.model_validate(row) for row in trained["prediction_rows"]],
        performance_by_horizon={str(h): {"random_forest": Metric(mae=1, rmse=2, sample_count=3)}
                                for h in (1, 3, 5)},
    )
    second = deepcopy(first)
    second.experiment_id, second.experiment_name = uuid4(), "Ex-005"
    second.performance_by_horizon["1"]["random_forest"].rmse = 1
    second.performance_by_horizon["5"]["random_forest"].rmse = 3
    saved = {first.experiment_id: first, second.experiment_id: second}
    monkeypatch.setattr(service, "get_detail", lambda db, key, user: saved[key])
    train = MagicMock(side_effect=AssertionError("Comparison must not train"))
    monkeypatch.setattr(service, "train_models", train)
    db = MagicMock()
    result = service.compare_results(db, list(saved), MagicMock())
    assert result["best_by_horizon"]["1"] == "Ex-005"
    assert result["best_by_horizon"]["5"] == "Ex-004"
    assert set(result["tied_experiment_ids_by_horizon"]["3"]) == set(saved)
    assert result["experiments"][0]["performance"]["1"] == {"mae": 1, "rmse": 2}
    assert set(Hyperparameters.model_fields) <= result["experiments"][0].keys()
    assert "warnings" not in result
    assert service.compare_results(db, list(reversed(saved)), MagicMock())["best_by_horizon"] == result["best_by_horizon"]
    train.assert_not_called()
    db.commit.assert_not_called()
    second.prediction_rows[0].actual_traffic_flow += 1
    with pytest.raises(HTTPException) as error:
        service.compare_results(db, list(saved), MagicMock())
    assert error.value.status_code == 422


def test_compare_post_contract_and_invalid_ids() -> None:
    from app.schemas.model_training import ExperimentComparisonRequest

    path = app.openapi()["paths"]["/api/model-training/experiments/compare"]
    assert "post" in path and "get" not in path
    assert path["post"]["requestBody"]["required"]
    identifier = uuid4()
    for ids in ([], [identifier], [identifier, identifier], ["not-a-uuid", str(uuid4())]):
        with pytest.raises(ValidationError):
            ExperimentComparisonRequest(experiment_ids=ids)
