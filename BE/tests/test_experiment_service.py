from datetime import UTC, datetime, timedelta

from app.services.experiment_service import (
    evaluate_experiment_models,
    prepare_time_series_split,
    run_experiment_from_split,
)


def _make_series(length: int = 60) -> list[tuple[datetime, float]]:
    base = datetime(2024, 1, 1, tzinfo=UTC)
    values: list[tuple[datetime, float]] = []
    for index in range(length):
        value = 100 + index * 1.5 + (10 if index % 5 == 0 else 0)
        values.append((base + timedelta(minutes=index), float(value)))
    return values


def test_prepare_time_series_split_uses_chronological_70_30() -> None:
    series = _make_series(60)

    train, test = prepare_time_series_split(series, split_ratio=0.7)

    assert len(train) == 42
    assert len(test) == 18
    assert train[-1][0] < test[0][0]
    assert all(train_item[0] < test_item[0] for train_item in train for test_item in [test[0]])


def test_evaluate_experiment_models_reports_horizon_metrics_and_predictions() -> None:
    series = _make_series(90)

    result = evaluate_experiment_models(series, horizons=(1, 3, 5), lag_count=5)

    assert set(result["performance_by_horizon"]) == {1, 3, 5}
    assert {"random_forest", "persistence", "historical_average"} <= {
        model_name for horizon in result["performance_by_horizon"].values() for model_name in horizon
    }
    assert all(
        horizon_metrics["random_forest"]["mae"] >= 0
        and horizon_metrics["random_forest"]["rmse"] >= 0
        for horizon_metrics in result["performance_by_horizon"].values()
    )
    assert result["prediction_rows"]
    payload = result["prediction_rows"][0].model_dump()
    assert set(payload) >= {
        "timestamp",
        "actual_traffic_flow",
        "random_forest_prediction",
        "persistence_prediction",
        "historical_average_prediction",
    }


def test_run_experiment_from_split_uses_split_payload_as_input() -> None:
    split_payload = {
        "dataset_version_id": "43490e7a-e464-4244-a9f1-229a197b60ab",
        "roi_identifier": "MAIN_ROI",
        "recording_session_id": "rec-001",
        "train_ratio": 0.7,
        "split_strategy": "chronological",
        "feature_order": ["lag_1", "lag_2", "lag_3", "lag_4", "lag_5"],
        "target_order": ["target_h1", "target_h3", "target_h5"],
        "X_train": [[10, 20, 30, 40, 50], [11, 21, 31, 41, 51], [12, 22, 32, 42, 52]],
        "y_train": [[100, 101, 102], [110, 111, 112], [120, 121, 122]],
        "X_test": [[13, 23, 33, 43, 53], [14, 24, 34, 44, 54]],
        "y_test": [[130, 131, 132], [140, 141, 142]],
        "official_evaluation_eligible": True,
    }

    result = run_experiment_from_split(split_payload, experiment_name="Ex-001")

    assert result.name == "Ex-001"
    assert set(result.performance_by_horizon) == {1, 3, 5}
    assert result.prediction_rows
