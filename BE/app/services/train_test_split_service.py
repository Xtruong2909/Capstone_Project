"""Split supplied FE samples and persist the immutable training input."""

import hashlib
import json
from datetime import UTC
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_scientist
from app.crud import crud_dataset_access, crud_model_training
from app.models.user import User
from app.schemas.model_training import TrainingSplit
from app.schemas.train_test_split import SplitSample, TrainTestSplitRequest, TrainTestSplitResponse


def split_training_samples(payload: TrainTestSplitRequest) -> TrainTestSplitResponse:
    samples = sorted(payload.samples, key=lambda sample: sample.time_bucket.astimezone(UTC))
    scope = (payload.dataset_version_id, payload.roi_identifier, payload.recording_session_id)
    seen = set()
    for sample in samples:
        if (sample.dataset_version_id, sample.roi_identifier, sample.recording_session_id) != scope:
            raise HTTPException(422, "All samples must belong to the requested version, ROI and recording session")
        timestamp = sample.time_bucket.astimezone(UTC)
        if timestamp in seen:
            raise HTTPException(422, "Duplicate sample time_bucket; splitting ambiguous samples is not allowed")
        seen.add(timestamp)

    initial_count = int(Decimal(str(payload.train_ratio)) * len(samples))
    train, test = samples[:initial_count], samples[initial_count:]
    if not train or not test:
        raise HTTPException(422, "The ratio must leave at least one sample in each set; train_count=floor(N * train_ratio)")
    boundary = min(sample.history_start_time.astimezone(UTC) for sample in test)

    def overlaps(sample: SplitSample) -> bool:
        return max(value.astimezone(UTC) for value in sample.target_times.model_dump().values()) >= boundary

    purged = []
    if payload.split_strategy == "purged_chronological":
        purged = [sample for sample in train if overlaps(sample)]
        train = [sample for sample in train if not overlaps(sample)]
        if not train:
            raise HTTPException(422, {
                "code": "INSUFFICIENT_SAFE_SPLIT_DATA",
                "message": "No training samples remain after purging target/history overlap. Supply more observed samples or use chronological for inspection only.",
                "total_samples": len(samples), "initial_train_count": initial_count,
                "purged_count": len(purged), "test_count": len(test),
                "official_evaluation_eligible": False,
            })
    overlap = any(overlaps(sample) for sample in train)
    warnings = []
    if overlap:
        warnings.append("Train target times overlap the Test observation window (including its five-minute lag history). Not eligible for official evaluation; use purged_chronological.")
    if purged:
        warnings.append("Boundary training samples were purged; the retained train/test ratio differs from the requested initial ratio.")
    return TrainTestSplitResponse(
        dataset_version_id=payload.dataset_version_id, roi_identifier=payload.roi_identifier,
        recording_session_id=payload.recording_session_id, train_ratio=payload.train_ratio,
        split_strategy=payload.split_strategy, total_samples=len(samples),
        initial_train_count=initial_count, train_count=len(train), test_count=len(test),
        purged_count=len(purged), purged_times=[sample.time_bucket for sample in purged],
        X_train=[sample.x for sample in train], y_train=[sample.y for sample in train],
        X_test=[sample.x for sample in test], y_test=[sample.y for sample in test],
        train_times=[sample.time_bucket for sample in train],
        test_times=[sample.time_bucket for sample in test],
        train_history_start_times=[sample.history_start_time for sample in train],
        test_history_start_times=[sample.history_start_time for sample in test],
        train_target_times=[sample.target_times for sample in train],
        test_target_times=[sample.target_times for sample in test],
        temporal_overlap_warning=overlap, official_evaluation_eligible=not overlap,
        warnings=warnings,
    )


def prepare_training_split(
    db: Session, payload: TrainTestSplitRequest, user: User,
) -> TrainTestSplitResponse:
    version = crud_dataset_access.get_version(db, payload.dataset_version_id)
    if version is None:
        raise HTTPException(404, "Dataset version not found")
    require_dataset_scientist(dataset_id=version.dataset_id, current_user=user, db=db)
    result = split_training_samples(payload)
    data = result.model_dump(mode="json", include=set(TrainingSplit.model_fields))
    fingerprint = hashlib.sha256(json.dumps(
        data, sort_keys=True, separators=(",", ":"),
    ).encode()).hexdigest()
    try:
        stored = crud_model_training.save_split(db, payload.dataset_version_id, fingerprint, data)
        result.split_id = stored.id
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Could not save train/test split; please retry") from exc
    return result
