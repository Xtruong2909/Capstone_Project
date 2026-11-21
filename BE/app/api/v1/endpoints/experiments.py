from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.experiment import Experiment
from app.models.user import User
from app.schemas.experiment import (
    ExperimentConfig,
    ExperimentCreateRequest,
    ExperimentFromSplitRequest,
    ExperimentRunResponse,
)
from app.services.experiment_service import create_experiment_name, run_experiment, run_experiment_from_split

router = APIRouter(tags=["Experiment"])


@router.post("/from-split", response_model=ExperimentRunResponse)
def create_experiment_from_split(
    payload: ExperimentFromSplitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExperimentRunResponse:
    split_config = payload.effective_configuration
    if split_config.dataset_version_id is None:
        raise HTTPException(status_code=400, detail="dataset_version_id is required")
    if not split_config.X_train or not split_config.X_test:
        raise HTTPException(status_code=400, detail="X_train and X_test are required")
    if not split_config.y_train or not split_config.y_test:
        raise HTTPException(status_code=400, detail="y_train and y_test are required")
    if split_config.official_evaluation_eligible is False:
        raise HTTPException(status_code=422, detail="Split result is not eligible for official evaluation")
    existing_names = [item.name for item in db.query(Experiment).all()]
    name = payload.name or create_experiment_name(existing_names)
    return run_experiment_from_split(payload, experiment_name=name)


@router.post("/", response_model=ExperimentRunResponse)
def create_experiment(
    payload: ExperimentCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExperimentRunResponse:
    if payload.configuration.dataset_version_id is None:
        raise HTTPException(status_code=400, detail="dataset_version_id is required")
    existing_names = [item.name for item in db.query(Experiment).all()]
    name = payload.name or create_experiment_name(existing_names)
    result = run_experiment(
        payload.configuration.time_period.get("series", []) if payload.configuration.time_period else [],
        experiment_name=name,
        configuration=payload.configuration,
    )
    return ExperimentRunResponse(
        experiment_id=None,
        name=result.name,
        status=result.status,
        execution_time_sec=result.execution_time_sec,
        configuration=result.configuration,
        performance_by_horizon=result.performance_by_horizon,
        prediction_rows=result.prediction_rows,
        logs=result.logs,
    )


@router.post("/{experiment_id}/run", response_model=ExperimentRunResponse)
def run_experiment_by_id(
    experiment_id: UUID,
    config: ExperimentConfig = ExperimentConfig(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExperimentRunResponse:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    series = []
    if isinstance(experiment.run_config, dict):
        series = experiment.run_config.get("series", [])
    if not series:
        raise HTTPException(status_code=400, detail="No time series prepared for this experiment")
    return run_experiment(series, experiment_name=experiment.name, configuration=config)


@router.get("/{experiment_id}", response_model=ExperimentRunResponse)
def get_experiment_detail(
    experiment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExperimentRunResponse:
    experiment = db.get(Experiment, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    config = ExperimentConfig.model_validate(experiment.run_config or {})
    return ExperimentRunResponse(
        experiment_id=experiment.id,
        name=experiment.name,
        status=experiment.status,
        execution_time_sec=float(experiment.execution_time_sec or 0.0),
        configuration=config,
        performance_by_horizon={},
        prediction_rows=[],
        logs=[],
    )
