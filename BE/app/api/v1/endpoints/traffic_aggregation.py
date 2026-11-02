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
    TrafficAggregationCalculationSummary,
    TrafficAggregationChartResponse,
    TrafficAggregationJobStatusResponse,
    TrafficAggregationPreviewResponse,
    TrafficAggregationStarted,
    TrafficAggregationStatusResponse,
)
from app.services.traffic_aggregation_service import (
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
        job_metadata={
            "source": "traffic_aggregation",
            "estimated": True,
            "calculation_method": {
                "vehicle_count": "count of distinct track_id values in each minute bucket",
                "traffic_flow": "Estimated Traffic Flow = vehicle_count / (aggregation_interval / 60)",
                "average_speed": "mean(source speed in m/s) * 3.6; output in km/h",
            },
        },
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
        estimated=True,
        calculation_metadata={
            "vehicle_count": "count of distinct track_id values in each minute bucket",
            "traffic_flow": "Estimated Traffic Flow = vehicle_count / (aggregation_interval / 60)",
            "average_speed": "mean(source speed in m/s) * 3.6; output in km/h",
            "units": {
                "vehicle_count": "vehicles per aggregation interval",
                "traffic_flow": "vehicles/minute",
                "average_speed": "km/h",
            },
        },
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/calculation-summary",
    response_model=TrafficAggregationCalculationSummary,
    summary="Xem tổng hợp cách tính các chỉ số giao thông cho cả dataset, phục vụ Data Scientist kiểm tra logic tính toán",
)
def get_traffic_aggregation_calculation_summary(
    dataset_id: UUID,
    aggregation_interval: int = Query(default=60, ge=60, le=900),
    roi_identifier: str = Query(default="MAIN_ROI", min_length=1, max_length=64),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_scientist),
) -> TrafficAggregationCalculationSummary:
    _, version = crud_dataset.get_dataset_latest_version(db, dataset_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    return TrafficAggregationCalculationSummary(
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        aggregation_interval=aggregation_interval,
        roi_identifier=roi_identifier,
        estimated=True,
        summary={
            "vehicle_count": {
                "meaning": "count of distinct track_id values observed during each minute bucket",
                "aggregation_rule": "unique track_id count per bucket",
                "example": "if 25 vehicles appear in one minute, vehicle_count = 25",
            },
            "average_speed": {
                "meaning": "average speed of all observed speed samples in the same minute bucket",
                "aggregation_rule": "mean(source speed values in m/s) * 3.6",
                "example": "if source speeds are [10, 15, 20] m/s, average_speed = 54.0 km/h",
            },
            "traffic_flow": {
                "meaning": "Estimated Traffic Flow based on distinct tracked vehicles per time bucket",
                "aggregation_rule": "vehicle_count / (aggregation_interval / 60)",
                "example": "if 30 vehicles in 1 minute => traffic_flow = 30.0 vehicles/minute",
            },
        },
        units={
            "vehicle_count": "vehicles per aggregation interval",
            "average_speed": "km/h",
            "traffic_flow": "vehicles/minute",
        },
        formulas={
            "vehicle_count": "count(distinct track_id) in time_bucket",
            "average_speed": "(sum(source_speed_m_s) / count(source_speed_m_s)) * 3.6",
            "traffic_flow": "vehicle_count / (aggregation_interval / 60)",
        },
        notes=[
            "Estimated Traffic Flow is derived from distinct track_id counts and is not an explicit detector line-crossing measurement.",
            "The Data Scientist can inspect these formulas together with preview and chart data to validate the interpretation of the result.",
        ],
    )


@router.get(
    "/{dataset_id}/traffic/aggregation/chart-data",
    response_model=TrafficAggregationChartResponse,
    summary="Trả dữ liệu cho 3 biểu đồ: Vehicle Count, Average Speed và Estimated Traffic Flow",
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
        traffic_flow=chart["traffic_flow"],
        estimated=True,
        calculation_metadata={
            "vehicle_count": "count of distinct track_id values in each minute bucket",
            "traffic_flow": "Estimated Traffic Flow = vehicle_count / (aggregation_interval / 60)",
            "average_speed": "mean(source speed in m/s) * 3.6; output in km/h",
            "units": {
                "vehicle_count": "vehicles per aggregation interval",
                "traffic_flow": "vehicles/minute",
                "average_speed": "km/h",
            },
        },
    )
