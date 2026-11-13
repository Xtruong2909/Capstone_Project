"""Create and read deterministic, persisted splits of saved Lag Feature samples."""

import hashlib
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_train_test_splits as repo
from app.models.lag_feature import (
    LagFeatureGeneration,
    LagFeatureSample,
    LagFeatureSplit,
    LagFeatureSplitSample,
)
from app.models.user import User
from app.schemas.lag_feature import (
    LagSplitLeakageCheck,
    LagSplitPreviewResponse,
    LagSplitPreviewSample,
    LagTrainTestSplitRequest,
    LagTrainTestSplitResponse,
)
from app.services.lag_feature_service import accessible_generation

LAG_HISTORY_MINUTES = 4
SPLIT_LEAKAGE_RULE = (
    "max(train timestamp + forecast horizon) < "
    "min(test timestamp - lag history duration)"
)
HORIZONS = (1, 3, 5)


@dataclass(frozen=True)
class SplitPlan:
    train_rows: list[tuple[LagFeatureSample, date]]
    test_rows: list[tuple[LagFeatureSample, date]]
    train_sessions: list[dict]
    test_sessions: list[dict]
    train_ratio_actual: float
    samples_by_horizon: dict[str, dict[str, int]]
    leakage_check: dict
    warnings: list[str]


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(409, "Saved Lag Feature timestamps must include a timezone")
    return value.astimezone(UTC)


def _train_group_count(group_count: int, train_ratio: float) -> int:
    if group_count < 2:
        raise HTTPException(
            422,
            "At least two distinct recording days or sessions with Lag Feature samples are required",
        )
    return min(group_count - 1, max(1, math.ceil(group_count * train_ratio)))


def build_split_plan(
    records: list[tuple[LagFeatureSample, date]],
    split_strategy: str,
    train_ratio: float,
    forecast_horizons: tuple[int, ...] = HORIZONS,
) -> SplitPlan:
    """Partition only by recording day or whole session, never individual rows."""
    if not records:
        raise HTTPException(422, "Feature Generation contains no persisted Lag Feature samples")

    session_info: dict[UUID, dict] = {}
    seen_sample_ids: set[int] = set()
    for row, recording_date in records:
        if row.id is None or row.id in seen_sample_ids:
            raise HTTPException(409, "Saved Lag Feature samples have missing or duplicate IDs")
        seen_sample_ids.add(row.id)
        if any(getattr(row, f"target_h{horizon}", None) is None for horizon in forecast_horizons):
            raise HTTPException(409, "Saved Lag Feature samples are missing a requested target horizon")
        timestamp = _utc(row.timestamp)
        info = session_info.get(row.session_id)
        if info is None:
            session_info[row.session_id] = {
                "dataset_id": row.dataset_id,
                "recording_date": recording_date,
                "first_timestamp": timestamp,
                "sample_count": 1,
            }
        else:
            if (info["dataset_id"], info["recording_date"]) != (row.dataset_id, recording_date):
                raise HTTPException(409, "A Recording Session has inconsistent Dataset or recording-date metadata")
            info["first_timestamp"] = min(info["first_timestamp"], timestamp)
            info["sample_count"] += 1

    if split_strategy == "DAY_BASED":
        dates = sorted({info["recording_date"] for info in session_info.values()})
        train_count = _train_group_count(len(dates), train_ratio)
        train_dates = set(dates[:train_count])
        train_session_ids = {
            session_id for session_id, info in session_info.items()
            if info["recording_date"] in train_dates
        }
    elif split_strategy == "SESSION_BASED":
        ordered_sessions = sorted(
            session_info,
            key=lambda session_id: (
                session_info[session_id]["first_timestamp"], str(session_id),
            ),
        )
        train_count = _train_group_count(len(ordered_sessions), train_ratio)
        train_session_ids = set(ordered_sessions[:train_count])
    else:
        raise HTTPException(422, "split_strategy must be DAY_BASED or SESSION_BASED")

    train_rows = [record for record in records if record[0].session_id in train_session_ids]
    test_rows = [record for record in records if record[0].session_id not in train_session_ids]
    if not train_rows or not test_rows:
        raise HTTPException(
            422,
            "The requested strategy and ratio must leave at least one sample in both Train and Test",
        )

    train_latest_target = max(
        _utc(row.timestamp) + timedelta(minutes=max(forecast_horizons))
        for row, _ in train_rows
    )
    test_earliest_history = min(
        _utc(row.timestamp) - timedelta(minutes=LAG_HISTORY_MINUTES)
        for row, _ in test_rows
    )
    has_leakage = train_latest_target >= test_earliest_history
    if has_leakage:
        raise HTTPException(422, {
            "code": "TRAIN_TEST_DATA_LEAKAGE",
            "message": "Train target timestamps overlap Test feature history; no split was saved.",
            "train_latest_target_time": train_latest_target.isoformat(),
            "test_earliest_history_time": test_earliest_history.isoformat(),
            "rule": SPLIT_LEAKAGE_RULE,
        })

    actual_ratio = len(train_rows) / len(records)

    def session_summaries(rows: list[tuple[LagFeatureSample, date]]) -> list[dict]:
        counts: dict[UUID, int] = defaultdict(int)
        for row, _ in rows:
            counts[row.session_id] += 1
        if split_strategy == "DAY_BASED":
            order_key = lambda session_id: (
                session_info[session_id]["recording_date"],
                session_info[session_id]["first_timestamp"],
                str(session_id),
            )
        else:
            order_key = lambda session_id: (
                session_info[session_id]["first_timestamp"], str(session_id),
            )
        ordered = sorted(counts, key=order_key)
        return [{
            "dataset_id": str(session_info[session_id]["dataset_id"]),
            "session_id": str(session_id),
            "recording_date": session_info[session_id]["recording_date"].isoformat(),
            "sample_count": counts[session_id],
        } for session_id in ordered]

    samples_by_horizon = {
        f"h{horizon}": {
            "total": len(records),
            "train": len(train_rows),
            "test": len(test_rows),
        }
        for horizon in forecast_horizons
    }
    warnings = []
    if not math.isclose(actual_ratio, train_ratio, rel_tol=0, abs_tol=1e-12):
        warnings.append(
            "train_ratio_actual differs from train_ratio_requested because splits keep whole days or sessions together."
        )
    if len(train_rows) < 2 or len(test_rows) < 2:
        warnings.append("At least one Train or Test subset contains fewer than two samples.")

    return SplitPlan(
        train_rows=train_rows,
        test_rows=test_rows,
        train_sessions=session_summaries(train_rows),
        test_sessions=session_summaries(test_rows),
        train_ratio_actual=actual_ratio,
        samples_by_horizon=samples_by_horizon,
        leakage_check={
            "checked": True,
            "has_leakage": False,
            "rule": SPLIT_LEAKAGE_RULE,
            "train_latest_target_time": train_latest_target.isoformat(),
            "test_earliest_history_time": test_earliest_history.isoformat(),
        },
        warnings=warnings,
    )


def _response(split: LagFeatureSplit) -> LagTrainTestSplitResponse:
    return LagTrainTestSplitResponse(
        split_id=split.id,
        feature_generation_id=split.feature_generation_id,
        status=split.status,
        split_strategy=split.split_strategy,
        train_ratio_requested=split.train_ratio_requested,
        train_ratio_actual=split.train_ratio_actual,
        forecast_horizons=split.forecast_horizons,
        shuffle=split.shuffle,
        total_sessions=split.total_sessions,
        train_sessions=split.train_sessions,
        test_sessions=split.test_sessions,
        total_samples=split.total_samples,
        train_sample_count=split.train_sample_count,
        test_sample_count=split.test_sample_count,
        samples_by_horizon=split.samples_by_horizon,
        leakage_check=LagSplitLeakageCheck.model_validate(split.leakage_check),
        warnings=split.warnings,
        created_at=split.created_at,
    )


def get_accessible_split(
    db: Session, user: User, split_id: UUID,
) -> tuple[LagFeatureSplit, LagFeatureGeneration]:
    split = repo.get_split(db, split_id)
    if split is None:
        raise HTTPException(404, "Train/Test Split not found")
    generation = accessible_generation(db, user, split.feature_generation_id)
    if generation.status != "COMPLETED":
        raise HTTPException(409, "Feature Generation must remain COMPLETED")
    if split.status != "COMPLETED":
        raise HTTPException(409, "Train/Test Split is not COMPLETED")
    return split, generation


def create_train_test_split(
    db: Session, user: User, payload: LagTrainTestSplitRequest,
) -> LagTrainTestSplitResponse:
    generation = accessible_generation(db, user, payload.feature_generation_id)
    if generation.status != "COMPLETED":
        raise HTTPException(409, "Feature Generation must be COMPLETED")

    configuration = {
        "split_strategy": payload.split_strategy,
        "train_ratio": payload.train_ratio,
        "shuffle": payload.shuffle,
        "forecast_horizons": list(payload.forecast_horizons),
    }
    configuration_hash = hashlib.sha256(json.dumps(
        configuration, sort_keys=True, separators=(",", ":"),
    ).encode()).hexdigest()
    existing = repo.find_split(db, generation.id, configuration_hash)
    if existing is not None:
        return _response(existing)

    records = repo.list_generation_samples(db, generation.id)
    if generation.sample_count != len(records):
        raise HTTPException(409, "Feature Generation sample_count does not match persisted Lag Feature samples")
    plan = build_split_plan(
        records, payload.split_strategy, payload.train_ratio, payload.forecast_horizons,
    )
    split_id = uuid4()
    leakage_check = plan.leakage_check
    split = LagFeatureSplit(
        id=split_id,
        feature_generation_id=generation.id,
        configuration_hash=configuration_hash,
        status="COMPLETED",
        split_strategy=payload.split_strategy,
        train_ratio_requested=payload.train_ratio,
        train_ratio_actual=plan.train_ratio_actual,
        shuffle=False,
        forecast_horizons=list(payload.forecast_horizons),
        total_sessions=len(plan.train_sessions) + len(plan.test_sessions),
        train_sessions=plan.train_sessions,
        test_sessions=plan.test_sessions,
        total_samples=len(records),
        train_sample_count=len(plan.train_rows),
        test_sample_count=len(plan.test_rows),
        samples_by_horizon=plan.samples_by_horizon,
        leakage_check=leakage_check,
        warnings=plan.warnings,
    )
    train_session_ids = {
        UUID(session["session_id"]) for session in plan.train_sessions
    }
    memberships = [
        LagFeatureSplitSample(
            split_id=split_id, sample_id=row.id,
            subset="TRAIN" if row.session_id in train_session_ids else "TEST",
        )
        for row, _ in records
    ]
    try:
        saved = repo.save_split(db, split, memberships)
    except IntegrityError:
        db.rollback()
        existing = repo.find_split(db, generation.id, configuration_hash)
        if existing is not None:
            return _response(existing)
        raise HTTPException(409, "Could not save Train/Test Split due to a conflicting configuration") from None
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Train/Test Split storage unavailable") from exc
    return _response(saved)


def get_train_test_split(
    db: Session, user: User, split_id: UUID,
) -> LagTrainTestSplitResponse:
    split, _ = get_accessible_split(db, user, split_id)
    return _response(split)


def preview_train_test_split(
    db: Session,
    user: User,
    split_id: UUID,
    subset: str,
    page: int,
    page_size: int,
    session_id: UUID | None,
) -> LagSplitPreviewResponse:
    get_accessible_split(db, user, split_id)
    total, rows = repo.page_split_samples(db, split_id, subset, page, page_size, session_id)
    return LagSplitPreviewResponse(
        split_id=split_id,
        subset=subset,
        session_id=session_id,
        page=page,
        page_size=page_size,
        total_records=total,
        total_pages=math.ceil(total / page_size),
        data=[LagSplitPreviewSample(
            dataset_id=row.dataset_id,
            session_id=row.session_id,
            timestamp=row.timestamp,
            **{f"lag_{index}": getattr(row, f"lag_{index}") for index in range(1, 6)},
            **{f"target_h{horizon}": getattr(row, f"target_h{horizon}") for horizon in HORIZONS},
            subset=row_subset,
        ) for row, row_subset in rows],
    )
