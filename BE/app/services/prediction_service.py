"""Manual prediction using completed experiment artifacts and observed session bins."""

import hashlib
import json
import logging
import math
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import numpy as np
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_prediction as repo
from app.models.dataset import RecordingSession
from app.models.lag_feature import LagFeatureForest, LagFeatureSplit
from app.models.model_training import ExperimentTrainedModel, ModelTrainingExperiment
from app.models.prediction import PredictionResult, PredictionRun
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries
from app.models.user import User
from app.schemas.prediction import (
    ForecastChart,
    ForecastDetail,
    ForecastHistoryItem,
    ForecastHistoryResponse,
    ForecastPrediction,
    ForecastRequest,
    ForecastResponse,
    ForecastResultRow,
    ForecastResultsResponse,
    ForecastSessionResult,
    PredictionExperiment,
    PredictionExperimentsResponse,
    PredictionSession,
    PredictionSessionsResponse,
)
from app.services.dataset_access_service import check_dataset_access
from app.services.ds_temporal_aggregation_service import get_accessible_temporal_jobs
from app.services.lag_feature_model_service import _load_forest
from app.services.lag_window_service import MINUTE, VehicleObservation, latest_lags
from app.services.train_test_splits_service import get_accessible_split

HORIZONS = (1, 3, 5)
FEATURE_ORDER = tuple(f"lag_{number}" for number in range(1, 6))
logger = logging.getLogger(__name__)


def _error(code: str, message: str, status: int = 409) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message})


def _require_scientist(user: User) -> None:
    if user.role_id != "data_scientist":
        raise HTTPException(403, "Cần quyền Nhà khoa học dữ liệu")


def _utc(value: datetime) -> datetime:
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).astimezone(UTC)


def _experiment_scope(
    db: Session, user: User, experiment_id: UUID,
) -> tuple[ModelTrainingExperiment, list[TrafficAggregationJob]]:
    _require_scientist(user)
    experiment = repo.experiment(db, experiment_id)
    if experiment is None:
        raise _error("EXPERIMENT_NOT_FOUND", "Không tìm thấy thí nghiệm", 404)
    if experiment.status != "COMPLETED" or experiment.lag_feature_split_id is None:
        raise _error("EXPERIMENT_NOT_COMPLETED", "Thí nghiệm Lag Features chưa hoàn thành")
    split, generation = get_accessible_split(db, user, experiment.lag_feature_split_id)
    configuration = generation.configuration or {}
    if (split.feature_generation_id != generation.id
            or configuration.get("lag_count") != 5
            or configuration.get("method") != "sliding_window"
            or tuple(configuration.get("forecast_horizons", [])) != HORIZONS
            or tuple(split.forecast_horizons or []) != HORIZONS
            or tuple((experiment.configuration or {}).get("forecast_horizons", [])) != HORIZONS):
        raise _error("MODEL_INCOMPATIBLE", "Cấu hình xử lý của thí nghiệm không tương thích với 5 giá trị lag")
    jobs = get_accessible_temporal_jobs(db, user, generation.aggregation_id)
    if any(job.status != "COMPLETED" or job.aggregation_interval != 60 for job in jobs):
        raise _error("MODEL_INCOMPATIBLE", "Dữ liệu tổng hợp 60 giây của thí nghiệm chưa hoàn thành")
    return experiment, jobs


def _validated_models(
    db: Session, experiment: ModelTrainingExperiment,
) -> tuple[dict[int, ExperimentTrainedModel], LagFeatureForest, dict]:
    trained = repo.models(db, experiment.id)
    by_horizon = {item.horizon: item for item in trained}
    if set(by_horizon) != set(HORIZONS) or len(trained) != 3:
        raise _error("MODEL_ARTIFACT_MISSING", "Thí nghiệm cần đủ 3 mô hình đã huấn luyện cho các mốc dự báo")
    forest_ids = {item.lag_feature_forest_id for item in trained}
    if None in forest_ids or len(forest_ids) != 1:
        raise _error("MODEL_INCOMPATIBLE", "Các mô hình dự báo không dùng chung tệp mô hình của thí nghiệm đã chọn")
    forest = db.get(LagFeatureForest, next(iter(forest_ids)))
    if forest is None:
        raise _error("MODEL_ARTIFACT_MISSING", "Thiếu thông tin tệp mô hình Random Forest đã lưu")
    split = db.get(LagFeatureSplit, experiment.lag_feature_split_id)
    if split is None or forest.generation_id != split.feature_generation_id:
        raise _error("MODEL_INCOMPATIBLE", "Tệp mô hình không thuộc lần tạo đặc trưng đã chọn")
    expected_hyperparameters = (experiment.configuration or {}).get("hyperparameters", {})
    if any(item.status != "COMPLETED" or item.model_type != "RANDOM_FOREST"
           or item.hyperparameters != expected_hyperparameters
           or item.artifact_reference != forest.artifact_path for item in trained):
        raise _error("MODEL_INCOMPATIBLE", "Nguồn gốc mô hình hoặc cách xử lý dữ liệu không khớp thí nghiệm")
    try:
        bundle = _load_forest(forest)
    except HTTPException as exc:
        raise _error("MODEL_ARTIFACT_MISSING", str(exc.detail)) from exc
    for horizon, item in by_horizon.items():
        model = bundle[str(horizon)]
        if getattr(model, "feature_names_in_", None) is not None and list(model.feature_names_in_) != list(FEATURE_ORDER):
            raise _error("MODEL_INCOMPATIBLE", f"Mô hình mốc +{horizon} phút sử dụng tên đặc trưng khác")
        if getattr(model, "n_features_in_", None) != 5:
            raise _error("MODEL_INCOMPATIBLE", f"Mô hình mốc +{horizon} phút yêu cầu số đặc trưng khác")
        if any(model.get_params().get(key) != value for key, value in expected_hyperparameters.items()):
            raise _error("MODEL_INCOMPATIBLE", f"Siêu tham số của mô hình mốc +{horizon} phút không khớp")
        if item.experiment_id != experiment.id or forest.split_id != experiment.lag_feature_split_id:
            raise _error("MODEL_INCOMPATIBLE", "Mô hình thuộc thí nghiệm hoặc lần chia dữ liệu khác")
    return by_horizon, forest, bundle


def list_experiments(db: Session, user: User) -> PredictionExperimentsResponse:
    _require_scientist(user)
    items = []
    for experiment in repo.completed_experiments(db):
        try:
            _experiment_scope(db, user, experiment.id)
            models, _forest, _bundle = _validated_models(db, experiment)
        except HTTPException:
            continue
        metrics = (experiment.performance_by_model_and_horizon or {}).get("RANDOM_FOREST", {})
        if not metrics:
            metrics = {key: value.get("random_forest", {})
                       for key, value in (experiment.performance_by_horizon or {}).items()}
        items.append(PredictionExperiment(
            experiment_id=experiment.id, experiment_name=experiment.name,
            status=experiment.status,
            hyperparameters=(experiment.configuration or {}).get("hyperparameters", {}),
            model_ids={str(h): models[h].model_id for h in HORIZONS},
            evaluation_metrics=metrics, prediction_eligible=True,
        ))
    return PredictionExperimentsResponse(experiments=items)


def _visible_candidates(
    db: Session, user: User, jobs: list[TrafficAggregationJob] | None,
) -> list[tuple]:
    _require_scientist(user)
    rows = repo.session_candidates(db, [job.id for job in jobs] if jobs is not None else None)
    visible = []
    seen: set[UUID] = set()
    allowed_datasets: set[UUID] = set()
    denied_datasets: set[UUID] = set()
    for result, job, session, version in rows:
        if (job.job_metadata or {}).get("workflow") != "ds_temporal_v1":
            continue
        if job.dataset_id not in allowed_datasets | denied_datasets:
            try:
                check_dataset_access(user, job.dataset_id, db)
                allowed_datasets.add(job.dataset_id)
            except HTTPException:
                denied_datasets.add(job.dataset_id)
        if job.dataset_id in denied_datasets or session.id in seen:
            continue
        seen.add(session.id)
        visible.append((result, job, session, version))
    return visible


def _observations(
    db: Session, job: TrafficAggregationJob, session: RecordingSession,
) -> tuple[list[TrafficTimeSeries], list[VehicleObservation]]:
    bins = repo.session_bins(db, job.id, session.id)
    observations = [VehicleObservation(
        dataset_id=job.dataset_id, session_id=session.id,
        timestamp=_utc(row.time_bucket), vehicle_count=row.vehicle_count,
    ) for row in bins]
    return bins, observations


def _latest_streak(observations: list[VehicleObservation]) -> int:
    if not observations:
        return 0
    ordered = sorted(observations, key=lambda row: row.timestamp)
    if not isinstance(ordered[-1].vehicle_count, int) or ordered[-1].vehicle_count < 0:
        return 0
    length = 1
    for previous, current in zip(reversed(ordered[:-1]), reversed(ordered[1:]), strict=True):
        if (current.timestamp - previous.timestamp != MINUTE
                or not isinstance(previous.vehicle_count, int) or previous.vehicle_count < 0):
            break
        length += 1
    return length


def list_sessions(
    db: Session, user: User, *, dataset_id: UUID | None,
    dataset_version_id: UUID | None, experiment_id: UUID | None,
    eligible_only: bool, page: int, page_size: int,
) -> PredictionSessionsResponse:
    jobs = _experiment_scope(db, user, experiment_id)[1] if experiment_id else None
    rows = _visible_candidates(db, user, jobs)
    sessions = []
    for _result, job, session, version in rows:
        if dataset_id and job.dataset_id != dataset_id:
            continue
        if dataset_version_id and job.dataset_version_id != dataset_version_id:
            continue
        bins, observations = _observations(db, job, session)
        streak = _latest_streak(observations)
        eligible = streak >= 5
        if eligible_only and not eligible:
            continue
        reason = None if eligible else (
            "INSUFFICIENT_HISTORY" if len(bins) < 5 else "NON_CONTIGUOUS_HISTORY"
        )
        sessions.append(PredictionSession(
            session_id=session.id, dataset_id=job.dataset_id,
            dataset_version_id=version.id,
            start_time=_utc(bins[0].time_bucket) if bins else None,
            end_time=_utc(bins[-1].time_bucket) if bins else None,
            aggregation_interval=job.aggregation_interval,
            total_records=len(bins), available_consecutive_minutes=streak,
            prediction_eligible=eligible, ineligible_reason=reason,
        ))
    sessions.sort(key=lambda item: (str(item.dataset_id), str(item.session_id)))
    return PredictionSessionsResponse(
        sessions=sessions[(page - 1) * page_size:page * page_size],
        total_records=len(sessions), page=page, page_size=page_size,
    )


def _run_response(db: Session, run: PredictionRun, experiment: ModelTrainingExperiment) -> ForecastResponse:
    by_session: dict[str, ForecastSessionResult] = {}
    for snapshot in run.session_snapshots:
        by_session[snapshot["session_id"]] = ForecastSessionResult(
            session_id=snapshot["session_id"], dataset_id=snapshot["dataset_id"],
            dataset_version_id=snapshot["dataset_version_id"],
            forecast_origin_time=snapshot["forecast_origin_time"],
            lag_features=snapshot["lag_features"], predictions=[],
        )
    for row in repo.run_results(db, run.id):
        by_session[str(row.session_id)].predictions.append(ForecastPrediction(
            horizon=row.horizon, model_id=row.model_id,
            forecast_timestamp=_utc(row.forecast_timestamp),
            predicted_vehicle_count=row.predicted_vehicle_count,
            actual_vehicle_count=row.actual_vehicle_count,
        ))
    return ForecastResponse(
        forecast_id=run.id, experiment_id=run.experiment_id,
        experiment_name=experiment.name, status=run.status,
        results_by_session=list(by_session.values()),
        session_errors=run.session_errors, prediction_time_ms=run.prediction_time_ms,
        created_at=_utc(run.created_at),
    )


def create_forecast(db: Session, user: User, payload: ForecastRequest) -> ForecastResponse:
    if not payload.forecast_horizons or any(h not in HORIZONS for h in payload.forecast_horizons):
        raise _error("INVALID_HORIZON", "Chỉ chọn các mốc dự báo 1, 3 và 5 phút", 422)
    if payload.forecast_origin != "LATEST_AVAILABLE":
        raise _error("INVALID_FORECAST_ORIGIN", "Chỉ hỗ trợ thời điểm quan sát mới nhất (LATEST_AVAILABLE)", 422)
    experiment, jobs = _experiment_scope(db, user, payload.experiment_id)
    models, forest, bundle = _validated_models(db, experiment)
    candidates = {session.id: (job, session, version) for _, job, session, version
                  in _visible_candidates(db, user, jobs)}
    prepared = []
    errors = []
    for session_id in payload.session_ids:
        candidate = candidates.get(session_id)
        if candidate is None:
            errors.append({"session_id": str(session_id), "code": "SESSION_NOT_FOUND",
                           "message": "Phiên ghi hình không thuộc dữ liệu tổng hợp của thí nghiệm"})
            continue
        job, session, version = candidate
        bins, observations = _observations(db, job, session)
        try:
            origin, lags = latest_lags(observations)
        except ValueError:
            code = "INSUFFICIENT_HISTORY" if len(bins) < 5 else "NON_CONTIGUOUS_HISTORY"
            message = (
                "Cần ít nhất 5 phút dữ liệu hợp lệ"
                if code == "INSUFFICIENT_HISTORY"
                else "5 phút gần nhất trong phiên phải liên tục và không trùng thời gian"
            )
            errors.append({"session_id": str(session_id), "code": code, "message": message})
            continue
        prepared.append((job, session, version, origin, lags))
    if not prepared:
        code = errors[0]["code"] if len({item["code"] for item in errors}) == 1 else "SESSION_NOT_ELIGIBLE"
        raise HTTPException(404 if code == "SESSION_NOT_FOUND" else 422,
                            {"code": code, "sessions": errors})
    fingerprint = hashlib.sha256(json.dumps({
        "user": str(user.id), "experiment": str(experiment.id),
        "requested_sessions": sorted(str(session_id) for session_id in payload.session_ids),
        "forest_sha256": forest.artifact_sha256,
        "sessions": sorted((str(session.id), origin.isoformat(), lags)
                           for _, session, _, origin, lags in prepared),
        "aggregation_jobs": sorted(str(job.id) for job, _, _, _, _ in prepared),
        "horizons": sorted(payload.forecast_horizons),
    }, sort_keys=True).encode()).hexdigest()
    existing = repo.existing_run(db, fingerprint)
    if existing is not None:
        return _run_response(db, existing, experiment)
    started = time.perf_counter()
    run = PredictionRun(
        id=uuid4(), experiment_id=experiment.id, created_by=user.id,
        request_fingerprint=fingerprint, status="COMPLETED",
        requested_horizons=sorted(payload.forecast_horizons), session_count=0,
        session_snapshots=[], session_errors=errors,
        model_artifacts={str(h): {"model_id": str(models[h].model_id),
                                  "forest_id": str(forest.id), "sha256": forest.artifact_sha256}
                         for h in payload.forecast_horizons},
        prediction_time_ms=0,
    )
    snapshots = []
    results = []
    for job, session, version, origin, lags in prepared:
        lag_features = {key: value for key, value in zip(FEATURE_ORDER, lags, strict=True)}
        historical = [{"timestamp": (origin - timedelta(minutes=4 - index)).isoformat(),
                       "traffic_flow": value}
                      for index, value in enumerate(reversed(lags))]
        session_results = []
        try:
            for horizon in sorted(payload.forecast_horizons):
                estimator = bundle[str(horizon)]
                x = np.asarray([lags], dtype=float)
                if getattr(estimator, "feature_names_in_", None) is not None:
                    try:
                        from pandas import DataFrame
                    except ImportError as exc:
                        raise _error("MODEL_INCOMPATIBLE", "Mô hình sử dụng tên đặc trưng cần thư viện pandas") from exc
                    x = DataFrame([lag_features], columns=list(FEATURE_ORDER))
                predicted = float(estimator.predict(x)[0])
                if not math.isfinite(predicted):
                    raise ValueError("Mô hình trả về số phương tiện không hợp lệ")
                # Existing vehicle prediction clips negative Random Forest output to zero.
                predicted = max(0.0, predicted)
                session_results.append(PredictionResult(
                    id=uuid4(), prediction_run_id=run.id, experiment_id=experiment.id,
                    model_id=models[horizon].model_id, dataset_id=job.dataset_id,
                    dataset_version_id=version.id, session_id=session.id,
                    horizon=horizon, forecast_origin_time=origin,
                    forecast_timestamp=origin + timedelta(minutes=horizon),
                    predicted_vehicle_count=predicted, actual_vehicle_count=None,
                    lag_features=lag_features, artifact_sha256=forest.artifact_sha256,
                    prediction_time_ms=0,
                ))
        except Exception as exc:
            errors.append({"session_id": str(session.id), "code": "PREDICTION_FAILED",
                           "message": str(exc)[:250]})
            continue
        snapshots.append({
            "session_id": str(session.id), "dataset_id": str(job.dataset_id),
            "dataset_version_id": str(version.id),
            "forecast_origin_time": origin.isoformat(),
            "lag_features": lag_features, "historical": historical,
            "source": "AGGREGATED_OBSERVATIONS",
            "independent_evaluation": False,
        })
        results.extend(session_results)
    if not results:
        raise HTTPException(422, {"code": "PREDICTION_FAILED", "sessions": errors})
    duration = (time.perf_counter() - started) * 1000
    run.session_count = len(snapshots)
    run.session_snapshots = snapshots
    run.session_errors = errors
    run.status = "PARTIAL" if errors else "COMPLETED"
    run.prediction_time_ms = duration
    for row in results:
        row.prediction_time_ms = duration / len(results)
    try:
        db.add(run)
        db.flush()
        db.add_all(results)
        db.commit()
        db.refresh(run)
    except IntegrityError as exc:
        logger.exception("Could not save prediction run %s", run.id)
        db.rollback()
        existing = repo.existing_run(db, fingerprint)
        if existing is None:
            raise _error("PREDICTION_FAILED", "Không thể lưu dự báo") from exc
        return _run_response(db, existing, experiment)
    except SQLAlchemyError as exc:
        logger.exception("Prediction storage unavailable for run %s", run.id)
        db.rollback()
        raise HTTPException(503, {"code": "PREDICTION_FAILED", "message": "Không thể truy cập nơi lưu dự báo"}) from exc
    return _run_response(db, run, experiment)


def _owned_run(db: Session, user: User, run_id: UUID) -> tuple[PredictionRun, ModelTrainingExperiment]:
    _require_scientist(user)
    run = repo.get_run(db, run_id)
    if run is None or run.created_by != user.id:
        raise HTTPException(404, "Không tìm thấy dự báo")
    experiment, _jobs = _experiment_scope(db, user, run.experiment_id)
    return run, experiment


def forecast_history(
    db: Session, user: User, *, experiment_id: UUID | None,
    session_id: UUID | None, status: str | None,
    created_from: datetime | None, created_to: datetime | None,
    page: int, page_size: int,
) -> ForecastHistoryResponse:
    _require_scientist(user)
    total, rows = repo.list_runs(
        db, created_by=user.id, experiment_id=experiment_id, session_id=session_id,
        status=status, created_from=created_from, created_to=created_to,
        page=page, page_size=page_size,
    )
    visible = []
    for run, name in rows:
        try:
            _experiment_scope(db, user, run.experiment_id)
        except HTTPException:
            continue
        visible.append(ForecastHistoryItem(
            forecast_id=run.id, experiment_id=run.experiment_id,
            experiment_name=name, session_count=run.session_count,
            forecast_horizons=run.requested_horizons, status=run.status,
            prediction_time_ms=run.prediction_time_ms, created_at=_utc(run.created_at),
        ))
    return ForecastHistoryResponse(forecasts=visible, total_records=total, page=page, page_size=page_size)


def forecast_detail(db: Session, user: User, run_id: UUID) -> ForecastDetail:
    run, experiment = _owned_run(db, user, run_id)
    return ForecastDetail(
        forecast_id=run.id, experiment_id=experiment.id,
        experiment_name=experiment.name,
        hyperparameters=(experiment.configuration or {}).get("hyperparameters", {}),
        selected_model_ids={key: value["model_id"] for key, value in run.model_artifacts.items()},
        session_ids=[item["session_id"] for item in run.session_snapshots],
        session_snapshots=run.session_snapshots,
        prediction_time_ms=run.prediction_time_ms, status=run.status,
        created_at=_utc(run.created_at),
    )


def forecast_results(
    db: Session, user: User, run_id: UUID, *,
    session_id: UUID | None, horizon: int | None, page: int, page_size: int,
) -> ForecastResultsResponse:
    _owned_run(db, user, run_id)
    total, rows = repo.page_results(
        db, run_id, session_id=session_id, horizon=horizon, page=page, page_size=page_size,
    )
    return ForecastResultsResponse(
        forecast_id=run_id, total_records=total, page=page, page_size=page_size,
        results=[ForecastResultRow(
            session_id=row.session_id, experiment_id=row.experiment_id, model_id=row.model_id,
            horizon=row.horizon, forecast_origin_time=_utc(row.forecast_origin_time),
            forecast_timestamp=_utc(row.forecast_timestamp),
            predicted_vehicle_count=row.predicted_vehicle_count,
            actual_vehicle_count=row.actual_vehicle_count,
            absolute_error=(abs(row.actual_vehicle_count - row.predicted_vehicle_count)
                            if row.actual_vehicle_count is not None else None),
        ) for row in rows],
    )


def forecast_chart(
    db: Session, user: User, run_id: UUID, session_id: UUID,
) -> ForecastChart:
    run, _experiment = _owned_run(db, user, run_id)
    snapshot = next((item for item in run.session_snapshots
                     if item["session_id"] == str(session_id)), None)
    if snapshot is None:
        raise HTTPException(404, "Phiên ghi hình không có dự báo trong lần chạy này")
    rows = [row for row in repo.run_results(db, run_id) if row.session_id == session_id]
    return ForecastChart(
        forecast_id=run_id, session_id=session_id, historical=snapshot["historical"],
        forecast=[{"timestamp": _utc(row.forecast_timestamp), "horizon": row.horizon,
                   "predicted_vehicle_count": row.predicted_vehicle_count} for row in rows],
    )
