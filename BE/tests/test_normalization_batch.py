import json
import math
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.services.dataset_normalization_service import _parse_number
from app.services.normalization_batch import FIELDS, write_pneuma_parquet


def scalar_rows(rows: list[list[str]], mapping: dict[str, str]) -> list[dict]:
    result = []
    for original in rows:
        row = original.copy()
        if not row or not any(row) or tuple(row) == FIELDS:
            continue
        while row and not row[-1].strip():
            row.pop()
        for start in range(4, len(row) - 5, 6):
            values = [
                _parse_number(row[0], integer=True), row[1].strip() or None,
                _parse_number(row[2]), _parse_number(row[3]),
                *[_parse_number(value) for value in row[start:start + 6]],
            ]
            result.append({mapping.get(k, k): v for k, v in zip(FIELDS, values)})
    return result


@pytest.mark.parametrize("mapping", [{}, {"lat": "latitude", "speed": "velocity"}, {"lat": "speed"}])
def test_columnar_matches_scalar(tmp_path: Path, mapping: dict[str, str]) -> None:
    rows = [
        [], list(FIELDS), ["short"],
        ["1", " car ", "", "nan"] + ["bad", "", "inf", "-inf", "nan", "1"] * 4,
        ["2", "bus", "12", "3"] + [" 37.5 ", "23", "4.5", "-1", "0", "2"] * 11 + ["", ""],
        ["3", "car", "1", "2", "1", "2", "3"],
    ]
    expected = scalar_rows(rows, mapping)
    path = tmp_path / "normalized.parquet"
    before, after = write_pneuma_parquet(
        [row.copy() for row in rows], path, mapping, _parse_number, batch_size=3,
    )
    assert before == 4
    assert after == 15
    assert pq.read_table(path).to_pylist() == expected
    parquet = pq.ParquetFile(path)
    assert all(parquet.metadata.row_group(i).num_rows <= 3 for i in range(parquet.num_row_groups))


def test_empty_output_has_stable_schema(tmp_path: Path) -> None:
    path = tmp_path / "empty.parquet"
    assert write_pneuma_parquet([], path, {}, _parse_number) == (0, 0)
    assert pq.read_table(path).num_rows == 0
    assert pq.read_schema(path).field("speed").type == pa.float64()


def test_service_preview_and_filename(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import dataset_normalization_service as service

    source = tmp_path / "20181024_d1_0830_0900.csv"
    source.write_text(
        ";".join(FIELDS) + "\n1;car;100;10;37;23;12;0;0;0;38;24;13;0;0;60\n",
        encoding="utf-8",
    )
    version = SimpleNamespace(
        id=uuid4(), data_file_path=str(source), version_tag="v1.0",
        original_filename=source.name, dataset=SimpleNamespace(name="test"),
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = version
    monkeypatch.setattr(service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(service.crud_dataset, "get_dataset_column_mapping", lambda *args: None)
    result = service.normalize_dataset_structure_service(
        db, dataset_id=uuid4(), user=MagicMock(), page=2, page_size=1,
    )
    assert (result.records_before, result.records_after) == (1, 2)
    assert result.preview.rows[0]["time"] == 60.0
    assert result.preview.original_filename == source.name
    assert not result.preview.pagination.has_more
    meta = json.loads((tmp_path / "staging" / f"{result.staging_id}.json").read_text(encoding="utf-8"))
    assert meta["original_filename"] == source.name


def test_normalization_benchmark(tmp_path: Path) -> None:
    rows = [
        [str(track), "car", "100", "15"]
        + ["37.98", "23.73", "12.5", "0.1", "-0.2", "12"] * 2048
        for track in range(100)
    ]
    started = perf_counter()
    expected = scalar_rows(rows, {})
    baseline = tmp_path / "baseline.parquet"
    with pq.ParquetWriter(baseline, pa.Table.from_pylist(expected[:20000]).schema, compression="snappy") as writer:
        for offset in range(0, len(expected), 20000):
            writer.write_table(pa.Table.from_pylist(expected[offset:offset + 20000]))
    old_seconds = perf_counter() - started
    path = tmp_path / "fast.parquet"
    started = perf_counter()
    assert write_pneuma_parquet(rows, path, {}, _parse_number) == (100, 204800)
    new_seconds = perf_counter() - started
    assert pq.read_table(path).equals(pq.read_table(baseline))
    assert math.isfinite(new_seconds)
    print(f"normalization 204800 points: scalar={old_seconds:.3f}s columnar={new_seconds:.3f}s speedup={old_seconds / new_seconds:.2f}x")
