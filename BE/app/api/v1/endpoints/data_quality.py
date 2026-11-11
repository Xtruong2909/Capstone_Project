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
    summary="Bắt đầu kiểm tra chất lượng Dataset Version hoặc Session",
    description=(
        "Gửi dataset_version_id để chọn version cụ thể; bỏ session_id để kiểm tra "
        "toàn bộ version, hoặc truyền session_id để kiểm tra riêng một Recording Session."
    ),
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
            dataset_version_id=payload.dataset_version_id if payload else None,
            session_id=payload.session_id if payload else None,
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
    summary="Xem trạng thái tác vụ kiểm tra",
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
    summary="Lấy báo cáo Data Quality tổng hợp theo Session",
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
    summary="Lấy lỗi kiểm tra có phân trang, có thể lọc theo Session",
    description="Truyền session_id để xem chi tiết lỗi của một Recording Session.",
)
def read_quality_check_issues(
    dataset_id: UUID,
    check_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    session_id: UUID | None = None,
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
            session_id=session_id,
        )
    except DataQualityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
