"""Save a verified comparison snapshot without selecting or training a model."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_comparison_history as repository
from app.crud import crud_model_training_experiments as experiments
from app.models.comparison_history import ComparisonHistory
from app.models.user import User
from app.schemas.comparison_history import ComparisonHistoryCreate, ComparisonHistoryResponse
from app.schemas.model_training import ExperimentComparisonRequest
from app.services.model_training_experiment_service import compare_experiments, get_experiment


def require_scientist(user: User) -> None:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Data Scientist access required")


def create_history(db: Session, user: User, payload: ComparisonHistoryCreate) -> ComparisonHistoryResponse:
    require_scientist(user)
    result = compare_experiments(db, user, ExperimentComparisonRequest(
        experiment_ids=payload.experiment_ids, forecast_horizons=payload.forecast_horizons,
    ))
    for experiment_id in payload.experiment_ids:
        record = experiments.get_experiment(db, experiment_id)
        if record is None or experiments.get_experiment_group_id(db, record) != payload.group_id:
            raise HTTPException(422, "All experiments must belong to the selected batch")
    history = ComparisonHistory(
        group_id=payload.group_id, created_by=user.id, mode=payload.mode,
        experiment_ids=[str(item) for item in payload.experiment_ids],
        result=result.model_dump(mode="json"),
    )
    try:
        repository.add_history(db, history)
        db.commit()
        db.refresh(history)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Could not save comparison history; please retry") from exc
    return ComparisonHistoryResponse.model_validate(history)


def list_history(db: Session, user: User, group_id: UUID) -> list[ComparisonHistoryResponse]:
    require_scientist(user)
    return [ComparisonHistoryResponse.model_validate(row)
            for row in repository.list_history(db, group_id, user.id)]


def get_history(db: Session, user: User, history_id: UUID) -> ComparisonHistoryResponse:
    require_scientist(user)
    history = repository.get_history(db, history_id, user.id)
    if history is None:
        raise HTTPException(404, "Comparison history not found")
    # Recheck source ownership and access before exposing a saved result.
    for experiment_id in history.experiment_ids:
        get_experiment(db, user, UUID(experiment_id))
    return ComparisonHistoryResponse.model_validate(history)
