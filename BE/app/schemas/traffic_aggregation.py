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
    traffic_density: float | None = None
    mean_speed: float | None = None
    congestion_level: str | None = None
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
        "vehicle_count": "distinct vehicles observed in the ROI for this minute",
        "traffic_flow": "estimated as vehicle_count / (aggregation_interval / 60)",
        "traffic_density": "estimated as vehicle_count / 1000.0 m² unless roi_area_m2 is provided",
        "average_speed": "mean speed from observed rows in the same bucket",
        "units": {
            "vehicle_count": "vehicles/minute",
            "traffic_flow": "vehicles/minute",
            "traffic_density": "vehicles/1000 m²",
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
    traffic_density: list[float | None]
    traffic_flow: list[float | None]
    estimated: bool = True
    calculation_metadata: dict[str, object] = {
        "vehicle_count": "distinct vehicles observed in the ROI for each minute bucket",
        "traffic_flow": "estimated vehicle rate based on vehicle_count when no explicit line-crossing counter exists",
        "traffic_density": "estimated using default area proxy of 1000 m² unless roi_area_m2 is available",
        "average_speed": "mean of observed speeds in the same bucket",
        "null_meaning": "if a metric is null, the source data did not provide enough information to compute it reliably",
        "units": {
            "vehicle_count": "vehicles/minute",
            "traffic_flow": "vehicles/minute",
            "traffic_density": "vehicles/1000 m²",
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
