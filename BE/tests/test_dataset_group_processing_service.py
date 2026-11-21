from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.services import dataset_group_processing_service as service


def test_group_normalization_starts_with_every_dataset() -> None:
    group_id, user_id = uuid4(), uuid4()
    datasets = [SimpleNamespace(id=uuid4(), name=f"day-{index}") for index in range(5)]
    db = MagicMock()
    with (
        patch.object(service.crud_dataset, "get_dataset_group_by_id", return_value=object()),
        patch.object(service.crud_dataset, "list_group_datasets", return_value=datasets),
        patch.object(service.crud_dataset, "get_active_group_processing_job", return_value=None),
        patch.object(service.crud_dataset, "create_group_processing_job", side_effect=lambda _, job: job),
    ):
        result = service.start_group_processing(
            db, group_id=group_id, operation="NORMALIZE",
            user=SimpleNamespace(id=user_id),
        )

    assert result.group_id == group_id
    assert result.staging_id == result.job_id
    assert result.total_datasets == 5
    assert [item.dataset_id for item in result.results] == [item.id for item in datasets]
    assert all(item.status == "PENDING" for item in result.results)


def test_group_job_keeps_successful_dataset_when_another_fails() -> None:
    dataset_ids = [uuid4(), uuid4()]
    job = SimpleNamespace(
        id=uuid4(), group_id=uuid4(), operation="NORMALIZE", status="PENDING",
        total_datasets=2, processed_datasets=0, created_by=uuid4(),
        results=[{"dataset_id": str(dataset_id), "dataset_name": str(dataset_id),
                  "status": "PENDING", "session_count": 0} for dataset_id in dataset_ids],
    )
    db = MagicMock()
    db.get.return_value = SimpleNamespace(id=job.created_by)
    normalized = SimpleNamespace(
        source_session_count=5, staging_id=uuid4(), source_version_id=uuid4(),
        records_before=100, records_after=500,
    )
    with (
        patch.object(service, "SessionLocal", return_value=db),
        patch.object(service.crud_dataset, "get_group_processing_job", return_value=job),
        patch.object(service.crud_dataset, "save_group_processing_job"),
        patch.object(service, "normalize_dataset_structure_service",
                     side_effect=[normalized, HTTPException(422, "CSV rỗng")]),
    ):
        service.run_group_processing_job(job.id)

    assert job.status == "PARTIAL_SUCCESS"
    assert job.processed_datasets == 2
    assert job.results[0]["status"] == "COMPLETED"
    assert job.results[0]["session_count"] == 5
    assert job.results[1]["status"] == "FAILED"
    assert job.results[1]["error_message"] == "CSV rỗng"
    db.rollback.assert_called_once()
    db.close.assert_called_once()


def test_export_requires_completed_group_normalization() -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), name="day-1")]
    with (
        patch.object(service.crud_dataset, "get_dataset_group_by_id", return_value=object()),
        patch.object(service.crud_dataset, "list_group_datasets", return_value=datasets),
        patch.object(service.crud_dataset, "get_active_group_processing_job", return_value=None),
        patch.object(service.crud_dataset, "get_latest_group_normalize_job", return_value=None),
    ):
        try:
            service.start_group_processing(
                MagicMock(), group_id=group_id, operation="EXPORT",
                user=SimpleNamespace(id=uuid4()),
            )
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("Export must require a group normalization job")


def test_repeated_export_returns_completed_job_without_new_work() -> None:
    group_id, dataset_id, staging_id = uuid4(), uuid4(), uuid4()
    datasets = [SimpleNamespace(id=dataset_id, name="day-1")]
    normalized_at = datetime.now(UTC)
    normalized = SimpleNamespace(
        id=uuid4(), group_id=group_id, operation="NORMALIZE", status="COMPLETED",
        staging_id=uuid4(),
        total_datasets=1, processed_datasets=1, updated_at=normalized_at,
        results=[{"dataset_id": str(dataset_id), "dataset_name": "day-1",
                  "status": "COMPLETED", "session_count": 5,
                  "staging_id": str(staging_id)}],
    )
    exported = SimpleNamespace(
        id=uuid4(), group_id=group_id, operation="EXPORT", status="COMPLETED",
        staging_id=normalized.staging_id,
        total_datasets=1, processed_datasets=1,
        created_at=normalized_at + timedelta(seconds=1),
        results=[{"dataset_id": str(dataset_id), "dataset_name": "day-1",
                  "status": "COMPLETED", "session_count": 5,
                  "staging_id": str(staging_id), "version_id": str(uuid4())}],
    )
    with (
        patch.object(service.crud_dataset, "get_dataset_group_by_id", return_value=object()),
        patch.object(service.crud_dataset, "list_group_datasets", return_value=datasets),
        patch.object(service.crud_dataset, "get_active_group_processing_job", return_value=None),
        patch.object(service.crud_dataset, "get_latest_group_normalize_job", return_value=normalized),
        patch.object(service.crud_dataset, "get_latest_completed_group_export_job", return_value=exported),
        patch.object(service.crud_dataset, "create_group_processing_job") as create_job,
    ):
        result = service.start_group_processing(
            MagicMock(), group_id=group_id, operation="EXPORT",
            user=SimpleNamespace(id=uuid4()),
        )

    assert result.job_id == exported.id
    assert result.staging_id == normalized.staging_id
    assert result.status == "COMPLETED"
    assert "staging_id" not in result.model_dump(mode="json")["results"][0]
    create_job.assert_not_called()


def test_export_rejects_missing_staging_before_creating_job(tmp_path) -> None:
    group_id, dataset_id, staging_id = uuid4(), uuid4(), uuid4()
    datasets = [SimpleNamespace(id=dataset_id, name="day-1")]
    normalized = SimpleNamespace(
        id=uuid4(), group_id=group_id, operation="NORMALIZE", status="COMPLETED",
        staging_id=uuid4(),
        total_datasets=1, processed_datasets=1, updated_at=datetime.now(UTC),
        results=[{"dataset_id": str(dataset_id), "dataset_name": "day-1",
                  "status": "COMPLETED", "session_count": 5,
                  "staging_id": str(staging_id)}],
    )
    with (
        patch.object(service.crud_dataset, "get_dataset_group_by_id", return_value=object()),
        patch.object(service.crud_dataset, "list_group_datasets", return_value=datasets),
        patch.object(service.crud_dataset, "get_active_group_processing_job", return_value=None),
        patch.object(service.crud_dataset, "get_latest_group_normalize_job", return_value=normalized),
        patch.object(service.crud_dataset, "get_latest_completed_group_export_job", return_value=None),
        patch.object(service.crud_dataset, "create_group_processing_job") as create_job,
        patch.object(service, "DATASET_UPLOAD_DIR", tmp_path),
    ):
        try:
            service.start_group_processing(
                MagicMock(), group_id=group_id, operation="EXPORT",
                user=SimpleNamespace(id=uuid4()),
            )
        except HTTPException as exc:
            assert exc.status_code == 409
            assert "Normalize lại" in exc.detail
        else:
            raise AssertionError("Missing staging must be reported before a job is queued")
    create_job.assert_not_called()


def test_export_job_uses_one_group_staging_id_and_keeps_file_ids_internal(tmp_path) -> None:
    group_id, dataset_id, file_staging_id = uuid4(), uuid4(), uuid4()
    datasets = [SimpleNamespace(id=dataset_id, name="day-1")]
    normalized = SimpleNamespace(
        id=uuid4(), group_id=group_id, staging_id=uuid4(),
        operation="NORMALIZE", status="COMPLETED", total_datasets=1,
        processed_datasets=1, updated_at=datetime.now(UTC),
        results=[{"dataset_id": str(dataset_id), "dataset_name": "day-1",
                  "status": "COMPLETED", "session_count": 5,
                  "staging_id": str(file_staging_id)}],
    )
    staging_dir = tmp_path / "staging"
    staging_dir.mkdir()
    (staging_dir / f"{file_staging_id}.json").write_text("{}", encoding="utf-8")
    with (
        patch.object(service.crud_dataset, "get_dataset_group_by_id", return_value=object()),
        patch.object(service.crud_dataset, "list_group_datasets", return_value=datasets),
        patch.object(service.crud_dataset, "get_active_group_processing_job", return_value=None),
        patch.object(service.crud_dataset, "get_latest_group_normalize_job", return_value=normalized),
        patch.object(service.crud_dataset, "get_latest_completed_group_export_job", return_value=None),
        patch.object(service.crud_dataset, "create_group_processing_job", side_effect=lambda _, job: job) as create_job,
        patch.object(service, "DATASET_UPLOAD_DIR", tmp_path),
    ):
        result = service.start_group_processing(
            MagicMock(), group_id=group_id, operation="EXPORT",
            user=SimpleNamespace(id=uuid4()),
        )

    assert result.staging_id == normalized.staging_id
    assert result.job_id != result.staging_id
    assert "staging_id" not in result.model_dump(mode="json")["results"][0]
    assert create_job.call_args.kwargs["job"].results[0]["staging_id"] == str(file_staging_id)
