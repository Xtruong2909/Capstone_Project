"""Train/validation/test protocol with a frozen search and one final evaluation."""

import hashlib
import math
from datetime import date
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_train_test_splits as split_repo
from app.crud import crud_validation_study as repo
from app.models.lag_feature import LagFeatureSample, LagFeatureSplit, LagFeatureSplitSample
from app.models.user import User
from app.models.validation_study import ValidationStudy
from app.schemas.model_training import Hyperparameters, TrainingExperimentResponse
from app.schemas.model_training_experiment import TrainingExperimentCreateRequest
from app.schemas.validation_study import ValidationStudyCreate, ValidationStudyResponse
from app.services.lag_feature_service import accessible_generation
from app.services.train_test_splits_service import SplitPlan, build_split_plan


def build_validation_plans(
    records: list[tuple[LagFeatureSample, date]], strategy: str,
    train_ratio: float, validation_ratio: float,
) -> tuple[SplitPlan, SplitPlan]:
    """Reserve whole final groups first, then partition the development groups."""
    groups = {day if strategy == "DAY_BASED" else row.session_id for row, day in records}
    if len(groups) < 3:
        raise HTTPException(422, "Validation requires at least three recording days or sessions with samples")
    # Ratios apply to whole temporal groups. Floor yields 2/1/1 days for 50/25/25.
    train_groups = max(1, math.floor(len(groups) * train_ratio))
    validation_groups = max(1, math.floor(len(groups) * validation_ratio))
    if train_groups + validation_groups >= len(groups):
        raise HTTPException(422, "Ratios must leave at least one whole group in Train, Validation and Test")
    # build_split_plan uses ceil; a midpoint avoids floating-point boundary errors.
    final = build_split_plan(records, strategy, (train_groups + validation_groups - 0.5) / len(groups))
    inner = build_split_plan(final.train_rows, strategy, (train_groups - 0.5) / (train_groups + validation_groups))
    return inner, final


def _response(study: ValidationStudy) -> ValidationStudyResponse:
    return ValidationStudyResponse.model_validate({
        field: getattr(study, field) for field in ValidationStudyResponse.model_fields
    })


def _accessible(db: Session, user: User, study_id: UUID, *, lock: bool = False) -> ValidationStudy:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Only Data Scientists and Admins can use validation")
    study = repo.get_study(db, study_id, lock=lock)
    if study is None:
        raise HTTPException(404, "Validation study not found")
    if study.created_by != user.id:
        raise HTTPException(403, "This validation study belongs to another user")
    accessible_generation(db, user, study.feature_generation_id)
    return study


def _partition(db: Session, generation_id: UUID, plan: SplitPlan, purpose: str, study_id: UUID, strategy: str) -> UUID:
    split_id = uuid4()
    train_ids = {row.id for row, _ in plan.train_rows}
    records = [*plan.train_rows, *plan.test_rows]
    split = LagFeatureSplit(
        id=split_id, feature_generation_id=generation_id, purpose=purpose,
        configuration_hash=hashlib.sha256(f"{study_id}:{purpose}".encode()).hexdigest(),
        status="COMPLETED", split_strategy=strategy,
        train_ratio_requested=plan.train_ratio_actual, train_ratio_actual=plan.train_ratio_actual,
        shuffle=False, forecast_horizons=[1, 3, 5],
        total_sessions=len(plan.train_sessions) + len(plan.test_sessions),
        train_sessions=plan.train_sessions, test_sessions=plan.test_sessions,
        total_samples=len(records), train_sample_count=len(plan.train_rows),
        test_sample_count=len(plan.test_rows), samples_by_horizon=plan.samples_by_horizon,
        leakage_check=plan.leakage_check, warnings=plan.warnings,
    )
    repo.add_partition(db, split, [LagFeatureSplitSample(
        split_id=split_id, sample_id=row.id, subset="TRAIN" if row.id in train_ids else "TEST",
    ) for row, _ in records])
    return split_id


def create_study(db: Session, user: User, payload: ValidationStudyCreate) -> ValidationStudyResponse:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Only Data Scientists and Admins can create validation studies")
    generation = accessible_generation(db, user, payload.feature_generation_id)
    if generation.status != "COMPLETED":
        raise HTTPException(409, "Feature Generation must be COMPLETED")
    records = split_repo.list_generation_samples(db, generation.id)
    if len(records) != generation.sample_count:
        raise HTTPException(409, "Saved sample count does not match Feature Generation")
    inner, final = build_validation_plans(records, payload.split_strategy, payload.train_ratio, payload.validation_ratio)
    study_id = uuid4()
    inner_id = _partition(db, generation.id, inner, "VALIDATION", study_id, payload.split_strategy)
    final_id = _partition(db, generation.id, final, "FINAL_TEST", study_id, payload.split_strategy)
    partition_summary = {}
    for name, rows, sessions in (
        ("train", inner.train_rows, inner.train_sessions),
        ("validation", inner.test_rows, inner.test_sessions),
        ("test", final.test_rows, final.test_sessions),
    ):
        partition_summary[name] = {
            "sample_count": len(rows), "session_count": len(sessions),
            "recording_dates": sorted({day.isoformat() for _, day in rows}), "sessions": sessions,
        }
    study = ValidationStudy(
        id=study_id, created_by=user.id, feature_generation_id=generation.id,
        validation_split_id=inner_id, final_split_id=final_id, status="READY",
        protocol={
            "split_strategy": payload.split_strategy, "train_ratio": payload.train_ratio,
            "validation_ratio": payload.validation_ratio, "partitions": partition_summary,
            "selection_metric": "Mean validation RMSE across horizons 1, 3, 5; ties: mean MAE, candidate order",
            "test_previously_used": payload.test_previously_used,
            "test_independence": "Previously inspected data; descriptive final evaluation" if payload.test_previously_used
            else "User-declared unused holdout; the system cannot verify previous use outside this study",
            "leakage_checks": {"train_validation": inner.leakage_check, "development_test": final.leakage_check},
        },
        candidates=[{"index": i, "hyperparameters": params.model_dump(mode="json"), "status": "PENDING"}
                    for i, params in enumerate(payload.candidates)], result=None,
    )
    repo.add_study(db, study)
    db.commit()
    db.refresh(study)
    return _response(study)


def list_studies(db: Session, user: User, generation_id: UUID) -> list[ValidationStudyResponse]:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Only Data Scientists and Admins can use validation")
    accessible_generation(db, user, generation_id)
    return [_response(study) for study in repo.list_studies(db, generation_id, user.id)]


def get_study(db: Session, user: User, study_id: UUID) -> ValidationStudyResponse:
    return _response(_accessible(db, user, study_id))


def _summary(result: TrainingExperimentResponse) -> dict:
    metrics = result.performance_by_model_and_horizon.get("RANDOM_FOREST", {})
    return {
        "experiment_id": str(result.experiment_id), "status": result.status, "error": result.error,
        "metrics": result.model_dump(mode="json")["performance_by_model_and_horizon"],
        "mean_rmse": math.fsum(metrics[str(h)].rmse for h in (1, 3, 5)) / 3 if result.status == "COMPLETED" else None,
        "mean_mae": math.fsum(metrics[str(h)].mae for h in (1, 3, 5)) / 3 if result.status == "COMPLETED" else None,
    }


def run_candidate(db: Session, user: User, study_id: UUID, index: int) -> ValidationStudyResponse:
    from app.services.model_training_experiment_service import create_experiment

    study = _accessible(db, user, study_id, lock=True)
    if not 0 <= index < len(study.candidates):
        raise HTTPException(404, "Candidate not found")
    if study.status not in ("READY", "VALIDATED"):
        raise HTTPException(409, "Another operation is running or selection has already been frozen")
    candidate = study.candidates[index]
    if candidate["status"] == "COMPLETED":
        return _response(study)
    study.status = "VALIDATING"
    study.candidates = [{**row, "status": "RUNNING"} if i == index else row for i, row in enumerate(study.candidates)]
    db.commit()  # Claim survives experiment service commits; prevents concurrent training/finalization.
    try:
        result = create_experiment(db, user, TrainingExperimentCreateRequest(
            split_id=study.validation_split_id,
            hyperparameters=Hyperparameters.model_validate(candidate["hyperparameters"]),
        ), validation_stage="VALIDATION")
        summary = _summary(result)
    except Exception as exc:
        db.rollback()
        summary = {"status": "FAILED", "error": "Validation failed; inspect backend logs or retry this candidate"}
        study = _accessible(db, user, study_id, lock=True)
        study.candidates = [{**row, **summary} if i == index else row for i, row in enumerate(study.candidates)]
        study.status = "READY"
        db.commit()
        raise HTTPException(503, summary["error"]) from exc
    study = _accessible(db, user, study_id, lock=True)
    study.candidates = [{**row, **summary} if i == index else row for i, row in enumerate(study.candidates)]
    study.status = "VALIDATED" if all(row["status"] == "COMPLETED" for row in study.candidates) else "READY"
    db.commit()
    return _response(study)


def choose_candidate(candidates: list[dict]) -> dict:
    if not candidates or any(row["status"] != "COMPLETED" for row in candidates):
        raise HTTPException(409, "Complete every frozen validation candidate before final evaluation")
    return min(candidates, key=lambda row: (row["mean_rmse"], row["mean_mae"], row["index"]))


def finalize_study(db: Session, user: User, study_id: UUID) -> ValidationStudyResponse:
    from app.services.model_training_experiment_service import create_experiment

    study = _accessible(db, user, study_id, lock=True)
    if study.status == "COMPLETED":
        return _response(study)
    if study.status != "VALIDATED":
        raise HTTPException(409, "Finish validation first; final Test can only be evaluated once per study")
    winner = choose_candidate(study.candidates)
    study.status = "FINALIZING"
    study.result = {"selected_candidate_index": winner["index"], "hyperparameters": winner["hyperparameters"]}
    db.commit()  # Freeze selection BEFORE touching Test targets.
    try:
        result = create_experiment(db, user, TrainingExperimentCreateRequest(
            split_id=study.final_split_id,
            hyperparameters=Hyperparameters.model_validate(winner["hyperparameters"]),
        ), validation_stage="FINAL_TEST")
        summary = _summary(result)
    except Exception as exc:
        db.rollback()
        study = _accessible(db, user, study_id, lock=True)
        study.status = "FINAL_FAILED"
        study.result = {**study.result, "error": "Final evaluation failed; selection remains frozen"}
        db.commit()
        raise HTTPException(503, study.result["error"]) from exc
    study = _accessible(db, user, study_id, lock=True)
    study.result = {**study.result, **summary}
    study.status = "COMPLETED" if result.status == "COMPLETED" else "FINAL_FAILED"
    db.commit()
    return _response(study)
