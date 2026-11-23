from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import datasets as endpoints
from app.core.deps import get_current_user
from app.database.database import get_db
from app.services import dataset_pipeline_service as service


@pytest.fixture
def pipeline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    now = datetime.now(UTC)
    owner_id, group_id = uuid4(), uuid4()
    session = SimpleNamespace(id=uuid4(), checksum="source", created_at=now)
    current = SimpleNamespace(id=uuid4(), recording_sessions=[session], data_file_path=None,
        parquet_file_path=None, csv_file_path=None, approval_status="PENDING")
    dataset = SimpleNamespace(id=uuid4(), name="day-1", dataset_files=[current], group_id=group_id,
        group=SimpleNamespace(name="Batch", source="uav", drone_id="d1"))
    mapping = SimpleNamespace(mappings=[{"source_column": "id", "target_column": "track_id"}], updated_at=now)
    context = SimpleNamespace(owner_id=owner_id, group_id=group_id, dataset=dataset,
        session=session, current=current, mapping=mapping, history=None, job=None, now=now)
    monkeypatch.setattr(service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(service.crud_dataset, "get_latest_group_processing_job", lambda *args: context.job)
    monkeypatch.setattr(service.crud_dataset, "get_dataset_column_mapping", lambda *args: context.mapping)
    monkeypatch.setattr(service.crud_dataset, "get_cleaning_history_by_file", lambda *args: context.history)
    monkeypatch.setattr(service.crud_dataset, "list_group_datasets",
        lambda db, group, visible, owner_id: [dataset] if group == group_id and owner_id == context.owner_id else [])
    monkeypatch.setattr(service.crud_dataset, "list_owned_pipeline_datasets", lambda db, owner: [dataset])
    return context


def make_job(pipeline: SimpleNamespace, operation: str, status: str) -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), group_id=pipeline.group_id, staging_id=uuid4(),
        operation=operation, status=status, total_datasets=1, processed_datasets=0,
        created_at=pipeline.now + timedelta(seconds=1), results=[{
            "dataset_id": str(pipeline.dataset.id), "dataset_name": "day-1", "status": status,
            "staging_id": str(uuid4()),
        }])


@pytest.mark.parametrize(("operation", "step"), [("NORMALIZE", 2), ("EXPORT", 3)])
def test_running_jobs_restore_their_step_without_browser_state(pipeline: SimpleNamespace, operation: str, step: int) -> None:
    pipeline.job = make_job(pipeline, operation, "RUNNING")
    result = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert result.step == step
    assert result.job.job_id == pipeline.job.id
    assert not result.completed


def test_completed_normalize_remains_visible_for_export(pipeline: SimpleNamespace, tmp_path: Path) -> None:
    pipeline.job = make_job(pipeline, "NORMALIZE", "COMPLETED")
    staging_id = pipeline.job.results[0]["staging_id"]
    (tmp_path / "staging").mkdir()
    (tmp_path / "staging" / f"{staging_id}.parquet").touch()
    result = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert result.normalized and not result.exported and not result.completed
    assert result.step == 3


def test_completed_batches_are_hidden_only_after_export_and_submission(pipeline: SimpleNamespace, tmp_path: Path) -> None:
    pipeline.current.data_file_path = "output.parquet"
    (tmp_path / "output.parquet").touch()
    pipeline.history = SimpleNamespace(created_at=pipeline.now + timedelta(seconds=2),
        parameters={"source_session_ids": [str(pipeline.session.id)]})
    pipeline.job = make_job(pipeline, "EXPORT", "COMPLETED")
    state = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert state.exported and state.step == 4 and not state.completed
    pipeline.current.approval_status = "APPROVED"
    listing = service.list_pipeline_groups(None, pipeline.owner_id, page=1, page_size=20, search=None)
    assert listing.total == 0 and listing.groups == []
    pipeline.current.approval_status = "REJECTED"
    assert service.list_pipeline_groups(None, pipeline.owner_id, page=1, page_size=20, search=None).total == 1


def test_new_upload_invalidates_old_job_and_source_key(pipeline: SimpleNamespace) -> None:
    pipeline.job = make_job(pipeline, "NORMALIZE", "COMPLETED")
    before = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    pipeline.current.recording_sessions.append(SimpleNamespace(id=uuid4(), checksum="new",
        created_at=pipeline.now + timedelta(seconds=3)))
    after = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert after.source_key != before.source_key
    assert after.job is None and not after.normalized and not after.exported


def test_remapping_invalidates_finished_export(pipeline: SimpleNamespace, tmp_path: Path) -> None:
    pipeline.job = make_job(pipeline, "EXPORT", "COMPLETED")
    pipeline.current.data_file_path = "output.parquet"
    (tmp_path / "output.parquet").touch()
    pipeline.history = SimpleNamespace(created_at=pipeline.now + timedelta(seconds=2), parameters={})
    pipeline.mapping.updated_at = pipeline.now + timedelta(seconds=3)
    state = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert not state.exported and not state.normalized and state.job is None


def test_workflow_endpoint_requires_owner_and_engineer_role(pipeline: SimpleNamespace) -> None:
    app = FastAPI()
    app.include_router(endpoints.normalization_router, prefix="/datasets")
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=pipeline.owner_id, role_id="data_engineer")
    path = f"/datasets/groups/{pipeline.group_id}/workflow"
    with TestClient(app) as client:
        assert client.get(path).status_code == 200
        assert client.get(f"/datasets/groups/{uuid4()}/workflow").status_code == 404
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4(), role_id="data_engineer")
        assert client.get(path).status_code == 404
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=pipeline.owner_id, role_id="data_scientist")
        assert client.get(path).status_code == 403


@pytest.mark.parametrize(("finished", "operation"), [
    ("NORMALIZE", "NORMALIZE"), ("EXPORT", "NORMALIZE"), ("EXPORT", "EXPORT"),
])
def test_processing_endpoints_reject_completed_current_steps(
    pipeline: SimpleNamespace, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    finished: str, operation: str,
) -> None:
    pipeline.job = make_job(pipeline, finished, "COMPLETED")
    if finished == "NORMALIZE":
        root = tmp_path / "staging"
        root.mkdir()
        (root / f"{pipeline.job.results[0]['staging_id']}.parquet").touch()
    else:
        pipeline.current.data_file_path = "output.parquet"
        (tmp_path / "output.parquet").touch()
        pipeline.history = SimpleNamespace(created_at=pipeline.now + timedelta(seconds=2), parameters={})
    monkeypatch.setattr(service.crud_dataset, "get_dataset_group_by_id", lambda *args, **kwargs: pipeline.dataset.group)
    monkeypatch.setattr(service.crud_dataset, "get_active_group_processing_job", lambda *args, **kwargs: None)

    def must_not_queue(*args, **kwargs):
        raise AssertionError("A completed batch must not create another processing job")

    monkeypatch.setattr(service.crud_dataset, "create_group_processing_job", must_not_queue)
    app = FastAPI()
    app.include_router(endpoints.normalization_router, prefix="/datasets")
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=pipeline.owner_id, role_id="data_engineer")
    with TestClient(app) as client:
        response = client.post(f"/datasets/groups/{pipeline.group_id}/{operation.lower()}")
    assert response.status_code == 409


def test_unexported_workflow_does_not_probe_remote_source_objects(
    pipeline: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    pipeline.current.data_file_path = 's3://unused/source.csv'

    def must_not_read_storage(*args: object, **kwargs: object) -> bool:
        raise AssertionError('An unexported workflow must not check a source object')

    monkeypatch.setattr(service, 'dataset_file_exists', must_not_read_storage)
    state = service.get_group_pipeline_state(None, pipeline.group_id, pipeline.owner_id)
    assert not state.exported
