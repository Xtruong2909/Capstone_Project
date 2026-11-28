"""Private, persistent comparison history endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.comparison_history import ComparisonHistoryCreate, ComparisonHistoryResponse
from app.services import comparison_history_service as service

router = APIRouter(prefix="/comparison-history", tags=["Comparison history"])


@router.post("", response_model=ComparisonHistoryResponse, status_code=201)
def create_history(payload: ComparisonHistoryCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)) -> ComparisonHistoryResponse:
    return service.create_history(db, user, payload)


@router.get("", response_model=list[ComparisonHistoryResponse])
def list_history(group_id: UUID, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> list[ComparisonHistoryResponse]:
    return service.list_history(db, user, group_id)


@router.get("/{history_id}", response_model=ComparisonHistoryResponse)
def get_history(history_id: UUID, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> ComparisonHistoryResponse:
    return service.get_history(db, user, history_id)
