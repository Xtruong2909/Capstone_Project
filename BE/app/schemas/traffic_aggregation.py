from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TemporalAggregationRequest(BaseModel):
    aggregation_interval: int = Field(default=60, ge=60, le=900)
    roi_identifier: str = Field(default="MAIN_ROI", min_length=1, max_length=64)
    replace_existing: bool = False


class TrafficAggregationRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_version_id: UUID
    time_bucket: datetime
    aggregation_interval: int
    roi_identifier: str
    vehicle_count: int
    traffic_flow: float | None = None
    mean_speed: float | None = None
    created_at: datetime
    estimated: bool = True


class TrafficAggregationResult(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    records_created: int
    generated_at: datetime
    reused_existing: bool = False
    estimated: bool = True


class TrafficAggregationStarted(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    job_id: UUID
    status: str = "queued"
    started_at: datetime


class TrafficAggregationJobStatusResponse(BaseModel):
    job_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    status: str
    progress_percent: int = 0
    records_created: int = 0
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    metadata: dict[str, object] | None = None


class TrafficAggregationStatusResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    records_count: int
    last_generated_at: datetime | None = None
    is_ready: bool = False


class TrafficAggregationPreviewResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    roi_identifier: str
    aggregation_interval: int
    items: list[TrafficAggregationRecord]
    page: int
    page_size: int
    has_more: bool
    total_count: int
    estimated: bool = True
    calculation_metadata: dict[str, object] = {
        "vehicle_count": "count of distinct track_id values in each minute bucket",
        "traffic_flow": "Estimated Traffic Flow = vehicle_count / (aggregation_interval / 60)",
        "average_speed": "mean(source speed in m/s) * 3.6; output in km/h",
        "units": {
            "vehicle_count": "vehicles per aggregation interval",
            "traffic_flow": "vehicles/minute",
            "average_speed": "km/h",
        },
    }


class TrafficAggregationChartResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    time_labels: list[str]
    vehicle_count: list[int]
    average_speed: list[float | None]
    traffic_flow: list[float | None]
    estimated: bool = True
    calculation_metadata: dict[str, object] = {
        "vehicle_count": "count of distinct track_id values in each minute bucket",
        "traffic_flow": "Estimated Traffic Flow = vehicle_count / (aggregation_interval / 60)",
        "average_speed": "mean(source speed in m/s) * 3.6; output in km/h",
        "units": {
            "vehicle_count": "vehicles per aggregation interval",
            "traffic_flow": "vehicles/minute",
            "average_speed": "km/h",
        },
    }


class TrafficAggregationCalculationSummary(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    roi_identifier: str
    estimated: bool = True
    summary: dict[str, object]
    units: dict[str, str]
    formulas: dict[str, str]
    notes: list[str]
