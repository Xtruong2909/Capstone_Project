"""Authenticated control plane; file bytes go directly from the browser to S3."""
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core import config
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset import DatasetUploadJobResponse
from app.schemas.direct_upload import (
    CompleteFileRequest,
    DirectUploadCapabilities,
    DirectUploadRequest,
    DirectUploadResponse,
    PartUrlsRequest,
    PartUrlsResponse,
)
from app.services import direct_upload_service as service

router = APIRouter()


@router.get('/capabilities', response_model=DirectUploadCapabilities)
def capabilities(user: User = Depends(require_data_engineer)) -> DirectUploadCapabilities:
    return DirectUploadCapabilities(mode=config.STORAGE_BACKEND)


@router.post('', response_model=DirectUploadResponse, status_code=201)
def start(payload: DirectUploadRequest, db: Session = Depends(get_db),
          user: User = Depends(require_data_engineer)) -> DirectUploadResponse:
    return service.start_direct_upload(db, user.id, payload)


@router.post('/{job_id}/files/{file_id}/parts', response_model=PartUrlsResponse)
def parts(job_id: UUID, file_id: UUID, payload: PartUrlsRequest,
          db: Session = Depends(get_db), user: User = Depends(require_data_engineer)) -> PartUrlsResponse:
    return service.get_part_urls(db, user.id, job_id, file_id, payload)


@router.post('/{job_id}/files/{file_id}/complete', response_model=DatasetUploadJobResponse)
def complete_file(job_id: UUID, file_id: UUID, payload: CompleteFileRequest,
                  db: Session = Depends(get_db), user: User = Depends(require_data_engineer)) -> DatasetUploadJobResponse:
    return service.complete_direct_file(db, user.id, job_id, file_id, payload)


@router.post('/{job_id}/complete', response_model=DatasetUploadJobResponse, status_code=202)
def complete_batch(job_id: UUID, request: Request, tasks: BackgroundTasks,
                   db: Session = Depends(get_db), user: User = Depends(require_data_engineer)) -> DatasetUploadJobResponse:
    result, queued = service.queue_direct_upload(db, user.id, job_id)
    if queued:
        tasks.add_task(service.run_direct_upload, job_id, request.client.host if request.client else None)
    return result


@router.delete('/{job_id}', status_code=204)
def cancel(job_id: UUID, db: Session = Depends(get_db),
           user: User = Depends(require_data_engineer)) -> Response:
    service.cancel_direct_upload(db, user.id, job_id)
    return Response(status_code=204)
