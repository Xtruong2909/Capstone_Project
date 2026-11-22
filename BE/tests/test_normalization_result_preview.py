import json
from types import SimpleNamespace
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi import HTTPException

from app.services import dataset_normalization_preview_service as service


@pytest.fixture
def output(tmp_path, monkeypatch):
    group_id, job_id, dataset_id, owner_id, staging_id = [uuid4() for _ in range(5)]
    result = SimpleNamespace(dataset_id=dataset_id, dataset_name="Actual upload", status="COMPLETED",
                             source_file_id=uuid4(), file_id=uuid4())
    job = SimpleNamespace(job_id=job_id, operation="NORMALIZE", results=[result])
    monkeypatch.setattr(service, "get_group_pipeline_state", lambda *args: SimpleNamespace(job=job))
    stored = SimpleNamespace(results=[{"dataset_id": str(dataset_id), "staging_id": str(staging_id)}])
    monkeypatch.setattr(service.crud_dataset, "get_group_processing_job", lambda *args: stored)
    monkeypatch.setattr(service, "DATASET_UPLOAD_DIR", tmp_path)
    root = tmp_path / "staging"
    root.mkdir()
    meta = {"dataset_id": str(dataset_id), "is_pneuma": True, "records_before": 2,
            "source_columns": ["track_id", "time"], "original_filename": "actual-normalized.parquet"}
    meta_path = root / f"{staging_id}.json"
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    path = root / f"{staging_id}.parquet"
    pq.write_table(pa.table({"vehicle_id": list(range(15)), "timestamp": [0.04 * n for n in range(15)]}), path)
    return SimpleNamespace(group_id=group_id, job_id=job_id, dataset_id=dataset_id, owner_id=owner_id,
        job=job, result=result, path=path, meta=meta, meta_path=meta_path,
        request=lambda **kwargs: service.get_normalization_result_preview(None,
            group_id=group_id, job_id=kwargs.get("job_id", job_id),
            dataset_id=kwargs.get("dataset_id", dataset_id), owner_id=owner_id))


def test_reads_ten_actual_mapped_rows_without_reprocessing_or_modifying_staging(output) -> None:
    before = output.path.read_bytes()
    result = output.request()
    assert result.is_pneuma is True
    assert result.records_before == 2 and result.records_after == 15
    assert result.source_columns == ["track_id", "time"]
    assert [(column.name, column.type) for column in result.preview.columns] == [
        ("vehicle_id", "integer"), ("timestamp", "float")]
    assert len(result.preview.rows) == 10
    assert result.preview.rows[9]["vehicle_id"] == 9
    assert result.preview.pagination.has_more is True
    assert result.preview.pagination.total_rows == 15
    assert result.preview.representation == "normalized"
    assert output.path.read_bytes() == before


@pytest.mark.parametrize("status", ["PENDING", "RUNNING", "FAILED"])
def test_unfinished_or_failed_result_cannot_be_previewed(output, status) -> None:
    output.result.status = status
    with pytest.raises(HTTPException) as error:
        output.request()
    assert error.value.status_code == 409


def test_old_jobs_and_foreign_datasets_are_rejected(output) -> None:
    for params in ({"job_id": uuid4()}, {"dataset_id": uuid4()}):
        with pytest.raises(HTTPException) as error:
            output.request(**params)
        assert error.value.status_code == 404


def test_staging_metadata_must_match_dataset_and_file_must_exist(output) -> None:
    output.meta["dataset_id"] = str(uuid4())
    output.meta_path.write_text(json.dumps(output.meta), encoding="utf-8")
    with pytest.raises(HTTPException) as error:
        output.request()
    assert error.value.status_code == 409
    output.meta["dataset_id"] = str(output.dataset_id)
    output.meta_path.write_text(json.dumps(output.meta), encoding="utf-8")
    output.path.unlink()
    with pytest.raises(HTTPException) as error:
        output.request()
    assert error.value.status_code == 409


def test_exported_results_read_current_export_instead_of_deleted_staging(output, monkeypatch) -> None:
    output.job.operation = "EXPORT"
    output.path.unlink()
    output.meta_path.unlink()
    history = SimpleNamespace(parameters={"is_pneuma": True}, records_before=2, records_after=15)
    monkeypatch.setattr(service.crud_dataset, "get_cleaning_history_by_file", lambda *args: history)
    from app.schemas.dataset import DatasetPreviewResponse
    preview = DatasetPreviewResponse(dataset_id=output.dataset_id, dataset_name="Actual upload",
        original_filename="export.parquet", file_format="PARQUET", file_size=100, status="APPROVED",
        columns=[{"name": "vehicle_id", "type": "integer"}], rows=[{"vehicle_id": 42}],
        pagination={"page": 1, "page_size": 10, "returned_rows": 1, "has_more": False})

    def load(db, **params):
        assert params["dataset_file_id"] == output.result.file_id
        assert params["dataset_id"] == output.dataset_id
        assert params["page_size"] == 10
        return preview

    monkeypatch.setattr(service, "get_dataset_preview", load)
    result = output.request()
    assert result.preview.rows == [{"vehicle_id": 42}]
    assert result.records_before == 2 and result.records_after == 15
