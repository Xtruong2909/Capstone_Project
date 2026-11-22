"""Best Overall uses all three Test horizons with reproducible, scoped selection."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints import model_training
from app.core.deps import get_current_user
from app.database.database import get_db
from app.schemas.model_training import (
    ExperimentComparisonRequest,
    ExperimentComparisonResponse,
    Hyperparameters,
    Metric,
    Prediction,
)
from app.services import model_training_experiment_service as service


@pytest.fixture
def candidates(monkeypatch: pytest.MonkeyPatch) -> list[SimpleNamespace]:
    split_id, file_id, dataset_id, session_id = uuid4(), uuid4(), uuid4(), uuid4()
    origin = datetime(2026, 1, 1, tzinfo=UTC)
    results = []
    for index, errors in enumerate(((17.32, 23.5, 29), (17.42, 22.8, 30.5), (17.53, 24, 31))):
        results.append(SimpleNamespace(
            experiment_id=UUID(int=index + 1), experiment_name=f"Ex-{index + 1:02d}",
            split_id=split_id, dataset_file_id=file_id, forecast_horizons=[1, 3, 5],
            status="COMPLETED", model="RANDOM_FOREST", evaluation_mode="exploratory",
            evaluation_policy="same-test-set", prediction_time_ms=10.0,
            hyperparameters=Hyperparameters(n_estimators=100, max_depth=10),
            model_ids={str(h): uuid4() for h in (1, 3, 5)},
            performance_by_model_and_horizon={model: {
                str(h): Metric(mae=20.0 - index, rmse=error, sample_count=1)
                for h, error in zip((1, 3, 5), errors, strict=True)
            } for model in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")},
            prediction_rows=[Prediction(
                model=model, horizon_minutes=h, forecast_origin_time=origin,
                target_timestamp=origin + timedelta(minutes=h), actual_traffic_flow=100,
                predicted_traffic_flow=80, absolute_error=20, squared_error=400,
                dataset_id=dataset_id, session_id=session_id,
            ) for model in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE") for h in (1, 3, 5)],
        ))
    by_id = {item.experiment_id: item for item in results}
    monkeypatch.setattr(service, "get_experiment", lambda _db, _user, key: by_id[key])
    return results


def compare(
    candidates: list[SimpleNamespace], horizons: list[int] | None = None,
) -> ExperimentComparisonResponse:
    return service.compare_experiments(MagicMock(), SimpleNamespace(id=uuid4()),
        ExperimentComparisonRequest(experiment_ids=[row.experiment_id for row in candidates],
                                    forecast_horizons=horizons or [1, 3, 5]))


def test_average_rmse_wins_even_when_other_experiment_has_lower_mae(candidates: list[SimpleNamespace]) -> None:
    response = compare(candidates)
    assert response.best_overall.selected_experiment_id == candidates[0].experiment_id
    assert response.best_overall.average_rmse == pytest.approx(23.2733333333333)
    assert response.best_overall.evaluation_partition == "TEST"
    assert response.best_overall.selection_saved is False
    assert response.best_overall.selected_model_ids == candidates[0].model_ids
    assert [score.experiment_name for score in response.best_overall.ranking] == ["Ex-01", "Ex-02", "Ex-03"]


def test_lowest_single_horizon_does_not_choose_overall_winner(candidates: list[SimpleNamespace]) -> None:
    candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"]["1"].rmse = 1
    candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"]["5"].rmse = 100
    assert compare(candidates).best_overall.selected_experiment_id == candidates[0].experiment_id


def test_ties_use_mae_then_prediction_time_and_never_treat_missing_time_as_zero(candidates: list[SimpleNamespace]) -> None:
    for result in candidates:
        result.performance_by_model_and_horizon = deepcopy(candidates[0].performance_by_model_and_horizon)
    for metric in candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"].values():
        metric.mae = 1
    assert compare(candidates).best_overall.selected_experiment_id == candidates[1].experiment_id
    for result in candidates:
        result.performance_by_model_and_horizon = deepcopy(candidates[1].performance_by_model_and_horizon)
    candidates[0].prediction_time_ms = None
    candidates[1].prediction_time_ms = 2
    candidates[2].prediction_time_ms = 1
    assert compare(candidates).best_overall.selected_experiment_id == candidates[2].experiment_id
    candidates[0].prediction_time_ms = 0
    assert compare(candidates).best_overall.selected_experiment_id == candidates[0].experiment_id


def test_ranking_uses_full_precision_and_deterministic_order(candidates: list[SimpleNamespace]) -> None:
    for result in candidates:
        result.performance_by_model_and_horizon = deepcopy(candidates[0].performance_by_model_and_horizon)
    candidates[2].performance_by_model_and_horizon["RANDOM_FOREST"]["5"].rmse -= 0.000001
    assert compare(candidates).best_overall.selected_experiment_id == candidates[2].experiment_id
    candidates[2].performance_by_model_and_horizon = deepcopy(candidates[0].performance_by_model_and_horizon)
    assert compare(list(reversed(candidates))).best_overall.selected_experiment_id == candidates[0].experiment_id


def test_partial_comparison_never_claims_best_overall(candidates: list[SimpleNamespace]) -> None:
    assert compare(candidates, [1]).best_overall is None


@pytest.mark.parametrize("mutation", ["split", "file", "test", "missing", "nonfinite"])
def test_incompatible_or_incomplete_comparisons_are_rejected(candidates: list[SimpleNamespace], mutation: str) -> None:
    if mutation == "split": candidates[1].split_id = uuid4()
    if mutation == "file": candidates[1].dataset_file_id = uuid4()
    if mutation == "test": candidates[1].prediction_rows[0].actual_traffic_flow += 1
    if mutation == "missing": del candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"]["5"]
    if mutation == "nonfinite": candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"]["5"].rmse = float("nan")
    with pytest.raises(HTTPException) as error:
        compare(candidates)
    assert error.value.status_code == 422


def setup_selection(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> tuple[MagicMock, MagicMock]:
    repo = service.repository
    query = MagicMock(return_value=[SimpleNamespace(id=item.experiment_id) for item in candidates])
    monkeypatch.setattr(repo, "list_experiments", query)
    monkeypatch.setattr(repo, "list_trained_models", lambda _db, key: [SimpleNamespace(
        horizon=int(h), model_id=model_id, model_type="RANDOM_FOREST", status="COMPLETED",
        artifact_reference="existing.joblib",
    ) for item in candidates if item.experiment_id == key for h, model_id in item.model_ids.items()])
    save = MagicMock()
    monkeypatch.setattr(repo, "save_best_overall_selection", save)
    return query, save


def test_auto_selection_queries_all_owned_completed_experiments_and_saves_model_ids(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    query, save = setup_selection(monkeypatch, candidates)
    user, db = SimpleNamespace(id=uuid4(), role_id="data_scientist"), MagicMock()
    result = service.select_best_overall(db, user, candidates[0].split_id)
    assert query.call_args.kwargs["owner_id"] == user.id
    assert query.call_args.kwargs["limit"] is None
    assert query.call_args.kwargs["status"] == "COMPLETED"
    assert result.best_overall.scope == "completed_experiments_in_split"
    assert result.best_overall.selection_saved
    assert result.best_overall.selected_at is not None
    saved = save.call_args.args[2]
    assert saved["selected_model_ids"] == {h: str(key) for h, key in candidates[0].model_ids.items()}
    assert saved["selected_by"] == str(user.id)
    assert saved["evaluation_partition"] == "TEST"


def test_auto_selection_excludes_missing_horizons_and_models(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    _, save = setup_selection(monkeypatch, candidates)
    candidates[0].model_ids.pop("5")
    candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"].pop("3")
    result = service.select_best_overall(MagicMock(), SimpleNamespace(id=uuid4(), role_id="data_scientist"), candidates[0].split_id)
    assert result.best_overall.selected_experiment_id == candidates[2].experiment_id
    assert len(result.best_overall.ranking) == 1
    assert set(result.best_overall.excluded_experiment_ids) == {candidates[0].experiment_id, candidates[1].experiment_id}
    assert save.call_count == 1


def test_failed_selection_save_returns_error_instead_of_claiming_saved(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    _, save = setup_selection(monkeypatch, candidates)
    save.side_effect = SQLAlchemyError("write failed")
    db = MagicMock()
    with pytest.raises(HTTPException) as error:
        service.select_best_overall(db, SimpleNamespace(id=uuid4(), role_id="admin"), candidates[0].split_id)
    assert error.value.status_code == 503
    db.rollback.assert_called_once()


def test_other_roles_cannot_select(monkeypatch: pytest.MonkeyPatch) -> None:
    query = MagicMock()
    monkeypatch.setattr(service.repository, "list_experiments", query)
    with pytest.raises(HTTPException) as error:
        service.select_best_overall(MagicMock(), SimpleNamespace(id=uuid4(), role_id="business_user"), uuid4())
    assert error.value.status_code == 403
    query.assert_not_called()


def test_no_eligible_experiments_does_not_save_a_selection(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    _, save = setup_selection(monkeypatch, candidates)
    for item in candidates:
        item.model_ids = {}
    with pytest.raises(HTTPException) as error:
        service.select_best_overall(MagicMock(), SimpleNamespace(id=uuid4(), role_id="data_scientist"), candidates[0].split_id)
    assert error.value.status_code == 409
    save.assert_not_called()


def test_selection_snapshot_preserves_existing_evaluation_metadata() -> None:
    db = MagicMock()
    experiment = SimpleNamespace(evaluation={"evaluation_policy": "test-only", "warnings": ["saved warning"]})
    db.get.return_value = experiment
    snapshot = {"selected_experiment_id": str(uuid4()), "evaluation_partition": "TEST"}
    service.repository.save_best_overall_selection(db, uuid4(), snapshot)
    assert experiment.evaluation["evaluation_policy"] == "test-only"
    assert experiment.evaluation["warnings"] == ["saved warning"]
    assert experiment.evaluation["best_overall_selection"] == snapshot
    db.commit.assert_called_once()


def test_best_overall_static_route_is_not_parsed_as_experiment_uuid(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    expected = compare(candidates)
    select = MagicMock(return_value=expected)
    monkeypatch.setattr(service, "select_best_overall", select)
    app = FastAPI()
    app.include_router(model_training.router)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4(), role_id="data_scientist")
    with TestClient(app) as client:
        response = client.post("/model-training/experiments/best-overall", json={"split_id": str(candidates[0].split_id)})
    assert response.status_code == 200
    assert response.json()["best_overall"]["evaluation_partition"] == "TEST"
    assert select.call_args.args[2] == candidates[0].split_id


def test_explicit_selection_never_includes_unchecked_experiments(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    query, save = setup_selection(monkeypatch, candidates)
    ids = [candidates[1].experiment_id, candidates[2].experiment_id]
    result = service.select_best_overall(
        MagicMock(), SimpleNamespace(id=uuid4(), role_id="data_scientist"),
        candidates[0].split_id, experiment_ids=ids,
    )
    assert result.best_overall.selected_experiment_id == candidates[1].experiment_id
    assert {item.experiment_id for item in result.best_overall.ranking} == set(ids)
    assert result.best_overall.scope == "compared_experiments"
    assert save.call_args.args[1] == candidates[1].experiment_id
    query.assert_not_called()


@pytest.mark.parametrize("issue", ["split", "failed", "missing_model", "missing_metric"])
def test_explicit_selection_rejects_invalid_selected_experiments_instead_of_silently_skipping(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace], issue: str,
) -> None:
    _, save = setup_selection(monkeypatch, candidates)
    split_id = candidates[0].split_id
    if issue == "split": candidates[1].split_id = uuid4()
    if issue == "failed": candidates[1].status = "FAILED"
    if issue == "missing_model": candidates[1].model_ids.pop("5")
    if issue == "missing_metric": candidates[1].performance_by_model_and_horizon["RANDOM_FOREST"].pop("3")
    with pytest.raises(HTTPException) as error:
        service.select_best_overall(
            MagicMock(), SimpleNamespace(id=uuid4(), role_id="data_scientist"), split_id,
            experiment_ids=[candidates[0].experiment_id, candidates[1].experiment_id],
        )
    assert error.value.status_code in (409, 422)
    save.assert_not_called()


def test_best_overall_route_forwards_exact_selected_ids(
    monkeypatch: pytest.MonkeyPatch, candidates: list[SimpleNamespace],
) -> None:
    select = MagicMock(return_value=compare(candidates))
    monkeypatch.setattr(service, "select_best_overall", select)
    app = FastAPI()
    app.include_router(model_training.router)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4(), role_id="data_scientist")
    ids = [candidates[0].experiment_id, candidates[2].experiment_id]
    with TestClient(app) as client:
        response = client.post("/model-training/experiments/best-overall", json={
            "split_id": str(candidates[0].split_id), "experiment_ids": [str(key) for key in ids],
        })
        duplicate = client.post("/model-training/experiments/best-overall", json={
            "split_id": str(candidates[0].split_id), "experiment_ids": [str(ids[0])] * 2,
        })
    assert response.status_code == 200
    assert select.call_args.kwargs["experiment_ids"] == ids
    assert duplicate.status_code == 422
