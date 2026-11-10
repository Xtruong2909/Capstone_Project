"""Observed one-minute flow -> shared lag convention, never model fitting."""

import math
from collections.abc import Sequence
from datetime import UTC, timedelta
from itertools import pairwise

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_scientist
from app.crud import crud_dataset_access, crud_feature_engineering
from app.crud.crud_recording_metadata import resolve_original_filename
from app.models.user import User
from app.schemas.feature_engineering import (
    FeatureRequest,
    LagFeatures,
    PredictionFeatureResponse,
    TargetTimes,
    TrafficObservation,
    TrainingFeatureResponse,
    TrainingSample,
    TrainingTargets,
)
from app.services.recording_time_service import recording_start_from_filename, recording_timestamp

MINUTE = timedelta(seconds=60)
HORIZONS = (1, 3, 5)


def _ordered(
    rows: Sequence[TrafficObservation], lag_count: int, horizons: Sequence[int],
) -> list[TrafficObservation]:
    if lag_count != 5 or tuple(horizons) != HORIZONS:
        raise ValueError("Only lag_count=5 and horizons=(1, 3, 5) are supported")
    ordered = []
    seen = set()
    for row in rows:
        if row.time_bucket.tzinfo is None:
            raise ValueError("time_bucket must include timezone")
        key = (*_scope(row), row.time_bucket.astimezone(UTC))
        if key in seen:
            raise ValueError("Duplicate time_bucket in the same recording session")
        seen.add(key)
        ordered.append(row)
    return sorted(ordered, key=lambda row: row.time_bucket.astimezone(UTC))


def _scope(row: TrafficObservation) -> tuple:
    return row.dataset_version_id, row.roi_identifier, row.recording_session_id


def _observed(row: TrafficObservation) -> bool:
    return row.traffic_flow is not None and math.isfinite(row.traffic_flow) and row.traffic_flow >= 0


def _lags(history: Sequence[TrafficObservation]) -> tuple[LagFeatures, list[float]]:
    x = [float(row.traffic_flow) for row in reversed(history)]
    return LagFeatures(**{f"lag_{i}": value for i, value in enumerate(x, 1)}), x


def build_training_features(
    traffic_time_series: Sequence[TrafficObservation], lag_count: int = 5,
    horizons: Sequence[int] = HORIZONS,
) -> list[TrainingSample]:
    rows = _ordered(traffic_time_series, lag_count, horizons)
    groups: dict[tuple, list[TrafficObservation]] = {}
    for row in rows:
        groups.setdefault(_scope(row), []).append(row)
    samples = []
    for group in groups.values():
        segment: list[TrafficObservation] = []
        for row in group:
            if not _observed(row):
                segment.clear()
                continue
            if segment and (
                row.time_bucket.astimezone(UTC) - segment[-1].time_bucket.astimezone(UTC)
            ) != MINUTE:
                segment.clear()
            segment.append(row)
            if len(segment) < 10:
                continue
            # t is the fifth observation; all minutes through t+5 are observed.
            window = segment[-10:]
            current = window[4]
            features, x = _lags(window[:5])
            future = [window[4 + h] for h in HORIZONS]
            y = [float(point.traffic_flow) for point in future]
            samples.append(TrainingSample(
                dataset_version_id=current.dataset_version_id,
                roi_identifier=current.roi_identifier,
                recording_session_id=current.recording_session_id,
                history_start_time=window[0].time_bucket, time_bucket=current.time_bucket,
                features=features, x=x, y=y,
                targets=TrainingTargets(**{f"target_h{h}": v for h, v in zip(HORIZONS, y)}),
                target_times=TargetTimes(**{
                    f"target_h{h}": point.time_bucket for h, point in zip(HORIZONS, future)
                }),
            ))
            segment = window
    return sorted(samples, key=lambda sample: sample.time_bucket)


def build_prediction_features(
    traffic_time_series: Sequence[TrafficObservation], lag_count: int = 5,
    horizons: Sequence[int] = HORIZONS,
) -> PredictionFeatureResponse:
    rows = _ordered(traffic_time_series, lag_count, horizons)
    if not rows:
        raise ValueError("Need five observed consecutive minutes for prediction")
    if len({_scope(row) for row in rows}) != 1:
        raise ValueError("Prediction requires exactly one version, ROI and recording session")
    history = rows[-5:]
    if len(history) != 5 or not all(_observed(row) for row in history):
        raise ValueError("Need five observed consecutive minutes for prediction")
    if any(
        right.time_bucket.astimezone(UTC) - left.time_bucket.astimezone(UTC) != MINUTE
        for left, right in pairwise(history)
    ):
        raise ValueError("Latest five minutes are not continuous; missing minutes are not filled")
    current = history[-1]
    features, x = _lags(history)
    return PredictionFeatureResponse(
        dataset_version_id=current.dataset_version_id, roi_identifier=current.roi_identifier,
        recording_session_id=current.recording_session_id,
        history_start_time=history[0].time_bucket, latest_time_bucket=current.time_bucket,
        features=features, x=x,
        target_times=[current.time_bucket + h * MINUTE for h in HORIZONS],
    )


def prepare_features(
    db: Session, payload: FeatureRequest, user: User, *, prediction: bool,
) -> TrainingFeatureResponse | PredictionFeatureResponse:
    version = crud_dataset_access.get_version(db, payload.dataset_version_id)
    if version is None:
        raise HTTPException(404, "Dataset version not found")
    require_dataset_scientist(dataset_id=version.dataset_id, current_user=user, db=db)
    filename = resolve_original_filename(
        db, dataset_id=version.dataset_id, version_id=version.id,
        original_filename=version.original_filename,
    )
    start = recording_start_from_filename(filename)
    records = crud_feature_engineering.read_feature_series(
        db, version_id=version.id, roi_identifier=payload.roi_identifier,
        recording_start=start, latest_only=prediction,
    )
    # Current storage has one source file per version, no per-row session column.
    # Do not merge versions or infer a session from a different version's file.
    observations = [TrafficObservation(
        dataset_version_id=record.dataset_version_id, roi_identifier=record.roi_identifier,
        recording_session_id=str(version.id),
        time_bucket=recording_timestamp(record.time_bucket, start),
        traffic_flow=record.traffic_flow, aggregation_interval=record.aggregation_interval,
    ) for record in records]
    try:
        if prediction:
            return build_prediction_features(observations)
        samples = build_training_features(observations)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return TrainingFeatureResponse(
        dataset_version_id=version.id, roi_identifier=payload.roi_identifier,
        sample_count=len(samples), samples=samples,
    )
