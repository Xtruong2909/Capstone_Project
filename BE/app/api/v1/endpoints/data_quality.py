from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_reader
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.data_quality import (
    DataQualityCheckRequest,
    DataQualityCheckStarted,
    DataQualityCheckStatus,
    DataQualityIssuesPage,
    DataQualityReport,
)
from app.services.data_quality_service import (
    DataQualityConflictError,
    DataQualityNotFoundError,
    DataQualityReportNotReadyError,
    DataQualitySchemaError,
    get_data_quality_issues,
    get_data_quality_report,
    get_data_quality_status,
    run_data_quality_check,
    start_data_quality_check,
)

router = APIRouter()


@router.post(
    "/{dataset_id}/quality-checks",
    response_model=DataQualityCheckStarted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="[Bước 3.1] Bắt đầu kiểm tra chất lượng dataset",
)
def start_quality_check(
    dataset_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
    payload: DataQualityCheckRequest | None = None,
) -> DataQualityCheckStarted:
    try:
        started, _ = start_data_quality_check(
            db,
            dataset_id=dataset_id,
            user=current_user,
        )
    except DataQualityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DataQualityConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DataQualitySchemaError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    background_tasks.add_task(
        run_data_quality_check,
        started.check_id,
        outlier_rules=payload.outlier_rules if payload else None,
    )
    return started


@router.get(
    "/{dataset_id}/quality-checks/{check_id}",
    response_model=DataQualityCheckStatus,
    summary="[Bước 3.2] Xem trạng thái tác vụ kiểm tra",
)
def read_quality_check_status(
    dataset_id: UUID,
    check_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DataQualityCheckStatus:
    try:
        return get_data_quality_status(db, dataset_id=dataset_id, check_id=check_id)
    except DataQualityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}/quality-checks/{check_id}/report",
    response_model=DataQualityReport,
    summary="[Bước 3.3] Lấy báo cáo Data Quality Check",
)
def read_quality_check_report(
    dataset_id: UUID,
    check_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DataQualityReport:
    try:
        return get_data_quality_report(db, dataset_id=dataset_id, check_id=check_id)
    except DataQualityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DataQualityReportNotReadyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}/quality-checks/{check_id}/issues",
    response_model=DataQualityIssuesPage,
    summary="[Bước 3.4] Lấy lỗi kiểm tra có phân trang",
)
def read_quality_check_issues(
    dataset_id: UUID,
    check_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DataQualityIssuesPage:
    try:
        return get_data_quality_issues(
            db,
            dataset_id=dataset_id,
            check_id=check_id,
            page=page,
            page_size=page_size,
        )
    except DataQualityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
