from pathlib import Path

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
