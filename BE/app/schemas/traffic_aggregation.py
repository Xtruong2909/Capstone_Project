from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TrafficAggregationDatasetSelection(BaseModel):
    dataset_id: UUID
    version_id: UUID | None = None


class MultiTemporalAggregationRequest(BaseModel):
    datasets: list[TrafficAggregationDatasetSelection] = Field(min_length=1, max_length=100)
    aggregation_interval: int = Field(default=60, ge=60, le=900)
    roi_identifier: str = Field(default="MAIN_ROI", min_length=1, max_length=64)
    replace_existing: bool = False

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "datasets": [
                    {"dataset_id": "9ff93038-d619-4581-9d1d-626d6018d993"},
                    {
                        "dataset_id": "ec59b336-4e2f-4980-a3fe-c6bbe14fc02e",
                        "version_id": "b592b1c9-0ac9-4c09-b0d6-c1763cbf8ab0",
                    },
                ],
                "aggregation_interval": 60,
                "roi_identifier": "MAIN_ROI",
                "replace_existing": False,
            }],
        },
    }


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


class TrafficAggregationBatchStarted(BaseModel):
    batch_id: UUID
    status: str = "queued"
    dataset_count: int
    jobs: list[TrafficAggregationStarted]
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


class TrafficAggregationBatchStatusResponse(BaseModel):
    dataset_count: int
    results: list[TrafficAggregationStatusResponse]


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


class TrafficAggregationBatchPreviewResponse(BaseModel):
    dataset_count: int
    results: list[TrafficAggregationPreviewResponse]


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


class TrafficAggregationBatchChartResponse(BaseModel):
    dataset_count: int
    results: list[TrafficAggregationChartResponse]


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


class TrafficAggregationBatchCalculationSummary(BaseModel):
    aggregation_interval: int
    roi_identifier: str
    estimated: bool = True
    aggregation_scope: str = "independent_per_dataset_version"
    summary: dict[str, object]
    units: dict[str, str]
    formulas: dict[str, str]
    notes: list[str]


class DatasetVersionTemporalAggregationRequest(BaseModel):
    dataset_version_id: UUID = Field(description="Approved Dataset Version to aggregate.")
    aggregation_interval: int = Field(default=60, ge=1, le=86400)

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "dataset_version_id": "5ee90c27-3f2d-4a7e-969b-269acf4b1697",
                "aggregation_interval": 60,
            }],
        },
    }


class AggregationSessionRunStatus(BaseModel):
    session_id: UUID
    status: str
    time_bins: int
    records_read: int
    error_message: str | None = None


class DatasetVersionAggregationStarted(BaseModel):
    aggregation_id: UUID
    dataset_version_id: UUID
    status: str
    aggregation_interval: int
    total_sessions: int
    completed_sessions: int
    failed_sessions: int
    total_time_bins: int
    sessions: list[AggregationSessionRunStatus]


class TemporalAggregationDataPoint(BaseModel):
    session_id: UUID
    timestamp: datetime
    vehicle_count: int


class DatasetVersionAggregationResults(BaseModel):
    aggregation_id: UUID
    dataset_version_id: UUID
    session_id: UUID | None = None
    status: str
    aggregation_interval: int
    total_sessions: int
    total_time_bins: int
    total_records: int
    page: int
    page_size: int
    total_pages: int
    sessions: list[AggregationSessionRunStatus] = Field(default_factory=list)
    data: list[TemporalAggregationDataPoint] = Field(default_factory=list)


class CombinedTemporalAggregationDataPoint(BaseModel):
    session_id: UUID
    timestamp: datetime
    vehicle_count: int


class CombinedTemporalAggregationResults(BaseModel):
    aggregation_id: UUID
    dataset_version_id: UUID
    aggregation_interval: int
    status: str
    timezone: str
    total_sessions: int
    completed_sessions: int
    failed_sessions: int
    total_time_bins: int
    sessions: list[AggregationSessionRunStatus] = Field(default_factory=list)
    data: list[CombinedTemporalAggregationDataPoint] = Field(default_factory=list)
