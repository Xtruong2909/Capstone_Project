"""Authenticated validation workflow endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.validation_study import ValidationStudyCreate, ValidationStudyResponse
from app.services import validation_study_service as service

router = APIRouter(prefix="/validation-studies", tags=["Validation"])


@router.post("", response_model=ValidationStudyResponse, status_code=201)
def create_study(payload: ValidationStudyCreate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> ValidationStudyResponse:
    return service.create_study(db, user, payload)


@router.get("", response_model=list[ValidationStudyResponse])
def list_studies(feature_generation_id: UUID, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> list[ValidationStudyResponse]:
    return service.list_studies(db, user, feature_generation_id)


@router.get("/{study_id}", response_model=ValidationStudyResponse)
def get_study(study_id: UUID, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> ValidationStudyResponse:
    return service.get_study(db, user, study_id)


@router.post("/{study_id}/candidates/{index}/run", response_model=ValidationStudyResponse)
def run_candidate(study_id: UUID, index: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)) -> ValidationStudyResponse:
    return service.run_candidate(db, user, study_id, index)


@router.post("/{study_id}/finalize", response_model=ValidationStudyResponse)
def finalize_study(study_id: UUID, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)) -> ValidationStudyResponse:
    return service.finalize_study(db, user, study_id)
