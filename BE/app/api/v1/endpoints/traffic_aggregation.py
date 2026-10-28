from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_scientist
from app.crud import crud_dataset
from app.database.database import SessionLocal, get_db
from app.models.traffic import TrafficAggregationJob
from app.models.user import User
from app.schemas.traffic_aggregation import (
    TemporalAggregationRequest,
    TrafficAggregationChartResponse,
    TrafficAggregationJobStatusResponse,
    TrafficAggregationPreviewResponse,
    TrafficAggregationStarted,
    TrafficAggregationStatusResponse,
)
from app.services.traffic_aggregation_service import (
    build_traffic_aggregation,
    get_traffic_aggregation_job_status,
    get_traffic_aggregation_status,
    get_traffic_chart_data,
    preview_traffic_aggregation,
    run_traffic_aggregation_job,
)

router = APIRouter()


@router.post(
    "/{dataset_id}/traffic/aggregation",
    response_model=TrafficAggregationStarted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Tổng hợp dữ liệu quỹ đạo theo khung thời gian cố định và lưu vào DB ở background job",
)
def run_traffic_aggregation(
    dataset_id: UUID,
    payload: TemporalAggregationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationStarted:
    _, version = crud_dataset.get_dataset_latest_version(db, dataset_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    job_id = uuid4()
    started_at = datetime.now(UTC)
    job = TrafficAggregationJob(
        id=job_id,
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        aggregation_interval=payload.aggregation_interval,
        roi_identifier=payload.roi_identifier,
        replace_existing=payload.replace_existing,
        status="queued",
        progress_percent=0,
        records_created=0,
        job_metadata={"source": "traffic_aggregation"},
        created_at=started_at,
        started_at=started_at,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        run_traffic_aggregation_job,
        db_session_factory=SessionLocal,
        dataset_id=dataset_id,
        version_id=version.id,
        aggregation_interval=payload.aggregation_interval,
        roi_identifier=payload.roi_identifier,
        replace_existing=payload.replace_existing,
        job_id=job_id,
    )

    return TrafficAggregationStarted(
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        aggregation_interval=payload.aggregation_interval,
        roi_identifier=payload.roi_identifier,
        job_id=job_id,
        status="queued",
        started_at=started_at,
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/jobs/{job_id}",
    response_model=TrafficAggregationJobStatusResponse,
    summary="Poll trạng thái job tổng hợp dữ liệu quỹ đạo đã lưu trong DB",
)
def get_traffic_aggregation_job(
    dataset_id: UUID,
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationJobStatusResponse:
    job = get_traffic_aggregation_job_status(db, dataset_id=dataset_id, job_id=job_id)
    return TrafficAggregationJobStatusResponse(
        job_id=job.id,
        dataset_id=job.dataset_id,
        dataset_version_id=job.dataset_version_id,
        aggregation_interval=job.aggregation_interval,
        roi_identifier=job.roi_identifier,
        status=job.status,
        progress_percent=job.progress_percent,
        records_created=job.records_created,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        metadata=job.job_metadata,
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/status",
    response_model=TrafficAggregationStatusResponse,
    summary="Xem trạng thái tổng hợp temporal và kết quả đã lưu",
)
def get_aggregation_status(
    dataset_id: UUID,
    aggregation_interval: int = Query(default=60, ge=60, le=900),
    roi_identifier: str = Query(default="MAIN_ROI", min_length=1, max_length=64),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationStatusResponse:
    status = get_traffic_aggregation_status(
        db,
        dataset_id=dataset_id,
        aggregation_interval=aggregation_interval,
        roi_identifier=roi_identifier,
    )
    return TrafficAggregationStatusResponse(
        dataset_id=status["dataset_id"],
        dataset_version_id=status["dataset_version_id"],
        aggregation_interval=status["aggregation_interval"],
        roi_identifier=status["roi_identifier"],
        records_count=status["records_count"],
        last_generated_at=status["last_generated_at"],
        is_ready=status["is_ready"],
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/preview",
    response_model=TrafficAggregationPreviewResponse,
    summary="Xem trước dữ liệu đã tổng hợp dưới dạng bảng với phân trang và lọc thời gian",
)
def preview_traffic_dataset(
    dataset_id: UUID,
    aggregation_interval: int = Query(default=60, ge=60, le=900),
    roi_identifier: str = Query(default="MAIN_ROI", min_length=1, max_length=64),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationPreviewResponse:
    preview = preview_traffic_aggregation(
        db,
        dataset_id=dataset_id,
        aggregation_interval=aggregation_interval,
        roi_identifier=roi_identifier,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    return TrafficAggregationPreviewResponse(
        dataset_id=preview["dataset_id"],
        dataset_version_id=preview["dataset_version_id"],
        roi_identifier=preview["roi_identifier"],
        aggregation_interval=preview["aggregation_interval"],
        items=preview["items"],
        page=preview["page"],
        page_size=preview["page_size"],
        has_more=preview["has_more"],
        total_count=preview["total_count"],
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/chart-data",
    response_model=TrafficAggregationChartResponse,
    summary="Trả dữ liệu cho 4 biểu đồ: Vehicle Count, Average Speed, Traffic Density và Traffic Flow",
)
def traffic_aggregation_chart_data(
    dataset_id: UUID,
    aggregation_interval: int = Query(default=60, ge=60, le=900),
    roi_identifier: str = Query(default="MAIN_ROI", min_length=1, max_length=64),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationChartResponse:
    chart = get_traffic_chart_data(
        db,
        dataset_id=dataset_id,
        aggregation_interval=aggregation_interval,
        roi_identifier=roi_identifier,
        start_time=start_time,
        end_time=end_time,
    )
    return TrafficAggregationChartResponse(
        dataset_id=chart["dataset_id"],
        dataset_version_id=chart["dataset_version_id"],
        aggregation_interval=chart["aggregation_interval"],
        roi_identifier=chart["roi_identifier"],
        time_labels=chart["time_labels"],
        vehicle_count=chart["vehicle_count"],
        average_speed=chart["average_speed"],
        traffic_density=chart["traffic_density"],
        traffic_flow=chart["traffic_flow"],
    )
