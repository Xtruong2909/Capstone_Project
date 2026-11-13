"""Data Scientist vehicle counts for normalized Dataset Versions."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import SessionLocal, get_db
from app.models.user import User
from app.schemas.traffic_aggregation import (
    CombinedTemporalAggregationResults,
    DatasetVersionAggregationResults,
    DatasetVersionAggregationStarted,
    GroupTemporalAggregationRequest,
)
from app.services.ds_temporal_aggregation_service import (
    create_group_temporal_aggregation,
    get_combined_temporal_aggregation_results,
    get_temporal_aggregation_results,
    run_group_temporal_aggregation,
    serialize_group_aggregation_run,
)

router = APIRouter()


@router.post(
    "",
    response_model=DatasetVersionAggregationStarted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Tổng hợp số phương tiện duy nhất theo từng phút và từng Session",
    description=(
        "Chỉ cần group_id để tổng hợp mọi Dataset trong nhóm; mỗi Dataset dùng phiên bản APPROVED mới nhất. "
        "Đếm COUNT DISTINCT track_id trong mỗi time bin từ Parquet đã chuẩn hóa. "
        "Tất cả Dataset và Session có một aggregation_id chung; xử lý nền và trả PROCESSING. "
        "vehicle_count không phải Traffic Flow qua counting line."
    ),
    responses={
        403: {"description": "Chưa được cấp quyền hoặc Dataset Version chưa APPROVED"},
        404: {"description": "Dataset Version không tồn tại"},
        409: {"description": "Thiếu dữ liệu chuẩn hóa hoặc aggregation đang chạy"},
    },
)
def create_ds_aggregation(
    payload: GroupTemporalAggregationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetVersionAggregationStarted:
    jobs, results = create_group_temporal_aggregation(db, current_user, payload)
    background_tasks.add_task(
        run_group_temporal_aggregation,
        db_session_factory=SessionLocal,
        aggregation_id=jobs[0].id,
    )
    return serialize_group_aggregation_run(jobs, results)


@router.get(
    "/{aggregation_id}/results",
    response_model=DatasetVersionAggregationResults,
    summary="Xem số phương tiện theo từng phút, tất cả hoặc một Session",
    description=(
        "Chỉ đọc kết quả đã lưu trong Database. Không truyền session_id để xem tất cả "
        "Session; dữ liệu sắp xếp theo session_id và timestamp tăng dần, có phân trang."
    ),
    responses={
        403: {"description": "Không được cấp quyền truy cập Dataset Version"},
        404: {"description": "Aggregation hoặc Session không tồn tại"},
    },
)
def get_ds_aggregation_results(
    aggregation_id: UUID,
    session_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DatasetVersionAggregationResults:
    return get_temporal_aggregation_results(
        db, current_user, aggregation_id, session_id, page, page_size,
    )


@router.get(
    "/{aggregation_id}/combined-results",
    response_model=CombinedTemporalAggregationResults,
    summary="Tổng hợp số phương tiện mỗi phút của toàn bộ Recording Sessions",
    description=(
        "Chỉ cần aggregation_id. Trả toàn bộ time bin đã lưu của các Session, "
        "mỗi dòng có session_id và vehicle_count của chính Session đó. "
        "Sắp xếp theo thời gian; các Session trùng phút vẫn là các dòng riêng. "
        "Không tạo phút trống, không tính lại từ file gốc."
    ),
    responses={
        403: {"description": "Không được cấp quyền truy cập Dataset Version"},
        404: {"description": "Aggregation không tồn tại"},
    },
)
def get_ds_combined_aggregation_results(
    aggregation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CombinedTemporalAggregationResults:
    return get_combined_temporal_aggregation_results(db, current_user, aggregation_id)


