import json
from pathlib import Path
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq

from app.services import normalized_data_validation_service
from app.services.normalized_data_validation_service import (
    validate_normalized_dataset_service,
)


def test_validation_reports_normalized_staging_counts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dataset_id = uuid4()
    staging_dir = tmp_path / "staging"
    staging_dir.mkdir()
    parquet_path = staging_dir / "sample.parquet"
    rows = [
        {"track_id": 1, "latitude": 37.5, "longitude": 127.0, "speed": 10.0},
        {"track_id": 2, "latitude": None, "longitude": 128.0, "speed": 12.0},
        {"track_id": 3, "latitude": 91.0, "longitude": 127.0, "speed": 12.0},
        {"track_id": 4, "latitude": 37.0, "longitude": 127.0, "speed": -1.0},
        {"track_id": 1, "latitude": 37.5, "longitude": 127.0, "speed": 10.0},
    ]
    pq.write_table(pa.Table.from_pylist(rows), parquet_path)
    (staging_dir / "sample.json").write_text(
        json.dumps(
            {
                "dataset_id": str(dataset_id),
                "staging_file_path": str(parquet_path),
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        normalized_data_validation_service,
        "DATASET_UPLOAD_DIR",
        tmp_path,
    )

    result = validate_normalized_dataset_service(dataset_id=dataset_id)

    assert result.model_dump(mode="json") == {
        "dataset_id": str(dataset_id),
        "validation_status": "completed",
        "total_rows": 5,
        "valid_rows": 1,
        "invalid_rows": 4,
        "validation_results": {
            "missing_values": 1,
            "duplicate_records": 1,
            "invalid_coordinates": 1,
            "negative_speed": 1,
        },
    }
