"""Validate and summarize saved Random Forest Test predictions by origin."""

import math
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_forecast_origin_analysis as repo
from app.crud import crud_model_training_experiments as experiment_repo
from app.models.dataset import RecordingSession
from app.models.lag_feature import LagFeatureSample
from app.models.model_training import ModelTrainingExperiment, ModelTrainingForecastResult
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries
from app.models.user import User
from app.schemas.forecast_origin_analysis import (
    ForecastOriginAnalysisResponse,
    ForecastOriginMetric,
    ForecastOriginPrediction,
    ForecastOriginSession,
)
from app.services import model_training_service as legacy_service
from app.services.ds_temporal_aggregation_service import get_accessible_temporal_jobs
from app.services.train_test_splits_service import get_accessible_split

HORIZONS = (1, 3, 5)
MINUTE = timedelta(minutes=1)


def _utc(value: datetime) -> datetime:
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).astimezone(UTC)


def _valid_bin(bin_row: TrafficTimeSeries | None, interval: int) -> bool:
    return bool(
        bin_row is not None
        and bin_row.aggregation_interval == interval
        and (
            (bin_row.bin_status == "COMPLETE" and bin_row.eligible_for_training is True)
            or (bin_row.bin_status == "UNKNOWN" and bin_row.eligible_for_training is None)
        )
        and bin_row.vehicle_count is not None
        and bin_row.vehicle_count >= 0
    )


def _valid_origin(
    sample: LagFeatureSample,
    rows: dict[int, ModelTrainingForecastResult],
    bins: dict[tuple[UUID, datetime], TrafficTimeSeries],
    job: TrafficAggregationJob,
    interval: int,
) -> bool:
    origin = _utc(sample.timestamp)
    step = timedelta(seconds=interval)
    if sample.aggregation_id is None or sample.dataset_id != job.dataset_id or len(rows) != len(HORIZONS):
        return False
    for index in range(5):
        history_time = origin - index * step
        observed = bins.get((sample.session_id, history_time))
        if not _valid_bin(observed, interval) or observed.dataset_version_id != job.dataset_version_id or observed.aggregation_id != job.id:
            return False
        if observed.vehicle_count != getattr(sample, f"lag_{index + 1}"):
            return False
    for horizon in HORIZONS:
        target_time = origin + horizon * MINUTE
        observed = bins.get((sample.session_id, target_time))
        result = rows.get(horizon)
        if not _valid_bin(observed, interval) or observed.dataset_version_id != job.dataset_version_id or observed.aggregation_id != job.id:
            return False
        if result is None or result.dataset_id != sample.dataset_id or result.session_id != sample.session_id:
            return False
        if _utc(result.input_timestamp) != origin or _utc(result.actual_timestamp) != target_time:
            return False
        if _utc(result.forecast_timestamp) != target_time:
            return False
        actual = float(observed.vehicle_count)
        if actual != float(getattr(sample, f"target_h{horizon}")) or actual != result.actual_vehicle_count:
            return False
        if not all(math.isfinite(value) and value >= 0 for value in (
            result.actual_vehicle_count, result.predicted_vehicle_count,
            result.absolute_error, result.squared_error,
        )):
            return False
        if not math.isclose(result.absolute_error, abs(actual - result.predicted_vehicle_count), abs_tol=1e-6):
            return False
        if not math.isclose(result.squared_error, (actual - result.predicted_vehicle_count) ** 2, abs_tol=1e-5):
            return False
    return True


def _metrics(rows: list[dict[int, ModelTrainingForecastResult]]) -> list[ForecastOriginMetric]:
    if not rows:
        return []
    return [
        ForecastOriginMetric(
            horizon_minutes=horizon,
            mae=sum(origin[horizon].absolute_error for origin in rows) / len(rows),
            rmse=math.sqrt(sum(origin[horizon].squared_error for origin in rows) / len(rows)),
            sample_count=len(rows),
        )
        for horizon in HORIZONS
    ]


def _stored_metrics(experiment: ModelTrainingExperiment) -> list[ForecastOriginMetric]:
    saved = (experiment.performance_by_model_and_horizon or {}).get("RANDOM_FOREST", {})
    metrics = []
    for horizon in HORIZONS:
        values = saved.get(str(horizon)) or saved.get(horizon)
        if not values or any(values.get(key) is None for key in ("mae", "rmse", "sample_count")):
            return []
        metrics.append(ForecastOriginMetric(
            horizon_minutes=horizon,
            mae=float(values["mae"]), rmse=float(values["rmse"]),
            sample_count=int(values["sample_count"]),
        ))
    return metrics


def get_forecast_origin_analysis(
    db: Session,
    user: User,
    experiment_id: UUID,
    session_id: UUID | None = None,
    origin_time: datetime | None = None,
) -> ForecastOriginAnalysisResponse:
    if user.role_id == "business_user":
        raise HTTPException(403, "Business Users must use published shared results")
    experiment = experiment_repo.get_experiment(db, experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    if experiment.status != "COMPLETED":
        raise HTTPException(409, "Forecast origin analysis requires a completed experiment")
    if experiment.lag_feature_split_id is None:
        legacy_service.get_detail(db, experiment_id, user)
        return ForecastOriginAnalysisResponse(
            experiment_id=experiment_id, dataset_version_id=None, sessions=[],
            selected_session_id=None, origins=[], selected_origin_time=None,
            predictions=[], session_metrics=[], overall_metrics=[],
            message="Thí nghiệm cũ không có bộ lag Test đã lưu để xác minh thời gian gốc.",
        )

    split, generation = get_accessible_split(db, user, experiment.lag_feature_split_id)
    if split.leakage_check.get("checked") is not True or split.leakage_check.get("has_leakage") is not False:
        raise HTTPException(409, "Train/Test Split has not passed leakage validation")
    jobs = get_accessible_temporal_jobs(db, user, generation.aggregation_id)
    if not jobs or any(job.status != "COMPLETED" or job.aggregation_interval != 60 for job in jobs):
        raise HTTPException(409, "A completed one-minute aggregation is required")
    test_samples = repo.list_test_samples(db, split.id)
    train_samples = repo.list_train_samples(db, split.id)
    if train_samples and test_samples:
        latest_train_target = max(_utc(row.timestamp) + 5 * MINUTE for row in train_samples)
        earliest_test_history = min(_utc(row.timestamp) - 4 * MINUTE for row in test_samples)
        if latest_train_target >= earliest_test_history:
            raise HTTPException(409, "Saved Train/Test Split has overlapping target and Test history")

    version_sessions: dict[UUID, tuple[RecordingSession, TrafficAggregationJob]] = {}
    for job in jobs:
        for row in repo.list_completed_run_sessions(db, job.id, job.dataset_id):
            version_sessions[row.id] = (row, job)
    version_session_ids = {str(key) for key in version_sessions}
    observations = {
        (UUID(row.recording_session_id), _utc(row.time_bucket)): row
        for row in repo.list_observations(db, [job.id for job in jobs])
        if row.recording_session_id in version_session_ids
    }
    predictions: dict[tuple[UUID, datetime], dict[int, ModelTrainingForecastResult]] = defaultdict(dict)
    for row in repo.list_random_forest_predictions(db, experiment_id):
        predictions[row.session_id, _utc(row.input_timestamp)][row.horizon] = row

    valid: dict[UUID, list[tuple[datetime, dict[int, ModelTrainingForecastResult]]]] = defaultdict(list)
    for sample in test_samples:
        session_and_job = version_sessions.get(sample.session_id)
        if session_and_job is None:
            continue
        _, job = session_and_job
        if sample.generation_id != generation.id or sample.aggregation_id != generation.aggregation_id:
            continue
        origin = _utc(sample.timestamp)
        rows = predictions.get((sample.session_id, origin), {})
        if _valid_origin(sample, rows, observations, job, job.aggregation_interval):
            valid[sample.session_id].append((origin, rows))

    sessions = [
        ForecastOriginSession(
            session_id=key, filename=version_sessions[key][0].original_filename, origin_count=len(values),
        )
        for key, values in sorted(valid.items(), key=lambda item: (item[1][0][0], str(item[0])))
    ]
    if session_id is not None and session_id not in version_sessions:
        raise HTTPException(404, "Recording Session does not belong to the experiment dataset version")
    if session_id is not None and session_id not in valid:
        raise HTTPException(422, "Recording Session has no valid Test forecast origins")
    selected_session_id = session_id or (sessions[0].session_id if sessions else None)
    selected_version_id = version_sessions[selected_session_id][1].dataset_version_id if selected_session_id else None
    selected = valid.get(selected_session_id, [])
    origins = [item[0] for item in selected]
    selected_origin = _utc(origin_time) if origin_time is not None else (origins[0] if origins else None)
    if origin_time is not None and selected_origin not in origins:
        raise HTTPException(422, "Forecast Origin is not valid for this Test Recording Session")
    selected_rows = next((rows for timestamp, rows in selected if timestamp == selected_origin), {})
    detail = [
        ForecastOriginPrediction(
            experiment_id=experiment_id, dataset_version_id=selected_version_id,
            session_id=selected_session_id, origin_time=selected_origin,
            horizon_minutes=horizon, target_time=selected_origin + horizon * MINUTE,
            actual=selected_rows[horizon].actual_vehicle_count,
            predicted=selected_rows[horizon].predicted_vehicle_count,
            absolute_error=selected_rows[horizon].absolute_error,
        )
        for horizon in HORIZONS
    ] if selected_rows else []
    all_valid_rows = [rows for values in valid.values() for _, rows in values]
    stored_metrics = _stored_metrics(experiment)
    overall_metrics = (
        stored_metrics
        if len(all_valid_rows) == split.test_sample_count
        and all(metric.sample_count == len(all_valid_rows) for metric in stored_metrics)
        else _metrics(all_valid_rows)
    )
    return ForecastOriginAnalysisResponse(
        experiment_id=experiment_id, dataset_version_id=selected_version_id,
        sessions=sessions, selected_session_id=selected_session_id,
        origins=origins, selected_origin_time=selected_origin, predictions=detail,
        session_metrics=_metrics([rows for _, rows in selected]),
        overall_metrics=overall_metrics,
        message=None if sessions else "Không có thời gian gốc Test nào đủ 5 lag hợp lệ và cả ba dự báo +1, +3, +5 phút.",
    )
