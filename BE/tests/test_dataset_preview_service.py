from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq

from app.models.dataset import DataCleaningHistory
from app.services import dataset_preview_service
from app.services.dataset_preview_service import _read_csv

PNEUMA_COLUMNS = [
    "track_id",
    "type",
    "traveled_d",
    "avg_speed",
    "lat",
    "lon",
    "speed",
    "lon_acc",
    "lat_acc",
    "time",
]


def test_pneuma_normalized_preview_splits_trajectory_and_skips_malformed_rows(
    tmp_path: Path,
) -> None:
    path = tmp_path / "pneuma.csv"
    path.write_text(
        "track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time\n"
        "17;Car;12.5;3.2;1.1;2.2;3.3;0.1;0.2;0;1.2;2.3;4.4;0.3;0.4;0.5;\n"
        "18;Bike;5;2;1.0;2.0;3;0;0;0;1;2;3;0;0\n"
        "19;Bus;6;2.5;3.1;4.2;5.3;0.4;0.5;1.0\n",
        encoding="utf-8",
    )

    first_page = _read_csv(path, offset=0, page_size=1, representation="normalized")
    second_page = _read_csv(path, offset=1, page_size=1, representation="normalized")
    third_page = _read_csv(path, offset=2, page_size=1, representation="normalized")

    assert [column.name for column in first_page.columns] == PNEUMA_COLUMNS
    assert first_page.rows == [
        {
            "track_id": 17,
            "type": "Car",
            "traveled_d": 12.5,
            "avg_speed": 3.2,
            "lat": 1.1,
            "lon": 2.2,
            "speed": 3.3,
            "lon_acc": 0.1,
            "lat_acc": 0.2,
            "time": 0.0,
        }
    ]
    assert second_page.rows[0]["track_id"] == 17
    assert second_page.rows[0]["lat"] == 1.2
    assert third_page.rows[0]["track_id"] == 19
    assert first_page.total_rows == 3
    assert first_page.has_more
    assert not any("extra_values" in row for row in first_page.rows)
    assert any("1 dòng pNEUMA lỗi" in warning for warning in first_page.warnings)


def test_non_pneuma_csv_keeps_its_original_schema_when_normalization_is_requested(
    tmp_path: Path,
) -> None:
    path = tmp_path / "sind-shaped.csv"
    path.write_text(
        "frame_id,agent_id,x_position,y_position,category\n"
        "1,car-1,12.0,4.5,vehicle\n",
        encoding="utf-8",
    )

    preview = _read_csv(path, offset=0, page_size=20, representation="normalized")

    assert preview.detected_structure == "generic_csv"
    assert preview.representation == "raw"
    assert [column.name for column in preview.columns] == [
        "frame_id",
        "agent_id",
        "x_position",
        "y_position",
        "category",
    ]
    assert preview.rows == [
        {
            "frame_id": 1,
            "agent_id": "car-1",
            "x_position": 12.0,
            "y_position": 4.5,
            "category": "vehicle",
        }
    ]
    assert any("Chưa có quy tắc chuẩn hóa" in warning for warning in preview.warnings)


def test_tab_csv_and_duplicate_header_are_reported_without_losing_cells(
    tmp_path: Path,
) -> None:
    path = tmp_path / "custom.tsv"
    path.write_text("id\tid\tlabel\n1\t2\tcar\n3\t\tbus\n", encoding="utf-8")

    preview = _read_csv(path, offset=0, page_size=20, representation="raw")

    assert [column.name for column in preview.columns] == ["id", "id_2", "label"]
    assert preview.rows == [
        {"id": 1, "id_2": 2, "label": "car"},
        {"id": 3, "id_2": None, "label": "bus"},
    ]
    assert any("tên cột trùng" in warning for warning in preview.warnings)


def test_exported_normalized_parquet_preview_does_not_warn_about_missing_rule(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dataset_id = uuid4()
    version_id = uuid4()
    parquet_path = tmp_path / "normalized.parquet"
    pq.write_table(
        pa.table(
            {
                "track_id": [1],
                "latitude": [37.5],
                "longitude": [127.0],
                "speed": [10.0],
            }
        ),
        parquet_path,
    )
    version = SimpleNamespace(
        id=version_id,
        file_format="PARQUET",
        original_filename="normalized.parquet",
        file_size_bytes=parquet_path.stat().st_size,
    )
    dataset = SimpleNamespace(id=dataset_id, name="Traffic")

    class FakeQuery:
        def filter(self, *args: object) -> "FakeQuery":
            return self

        def first(self) -> object:
            return SimpleNamespace(id=1)

    class FakeDb:
        def query(self, model: object) -> FakeQuery:
            assert model is DataCleaningHistory
            return FakeQuery()

    monkeypatch.setattr(
        dataset_preview_service.crud_dataset,
        "get_dataset_version",
        lambda db, requested_dataset_id, requested_version_id: (dataset, version),
    )
    monkeypatch.setattr(
        dataset_preview_service,
        "_resolve_file_path",
        lambda requested_version: parquet_path,
    )

    preview = dataset_preview_service.get_dataset_preview(
        FakeDb(),
        dataset_id=dataset_id,
        dataset_version_id=version_id,
        page=1,
        page_size=20,
        representation="normalized",
    )

    assert preview.status == "normalized"
    assert preview.representation == "normalized"
    assert not any("Chưa có quy tắc chuẩn hóa" in warning for warning in preview.warnings)
    assert preview.rows == [
        {"track_id": 1, "latitude": 37.5, "longitude": 127.0, "speed": 10.0}
    ]
