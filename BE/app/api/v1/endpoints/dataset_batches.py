from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset_batch import BatchDeleteResponse
from app.services.dataset_batch_service import delete_batch

router = APIRouter()


@router.delete('/groups/{group_id}', response_model=BatchDeleteResponse,
               summary='Xóa batch của bạn chưa gửi duyệt hoặc đã bị từ chối toàn bộ')
def delete_dataset_batch(group_id: UUID, db: Session = Depends(get_db),
                         user: User = Depends(require_data_engineer)) -> BatchDeleteResponse:
    return delete_batch(db, group_id, user)
