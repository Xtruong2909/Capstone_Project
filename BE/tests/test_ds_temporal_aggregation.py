from datetime import UTC, datetime, timedelta, timezone
from itertools import islice
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi import HTTPException

from app.schemas.traffic_aggregation import (
    GroupDatasetTemporalAggregationRequest,
    GroupTemporalAggregationRequest,
)
from app.services import ds_temporal_aggregation_service as service


def test_count_distinct_track_per_observed_minute_without_filling_gaps() -> None:
    rows = [(1, 0), (1, 20), (2, 30), (1, 180)]
    start = datetime(2018, 10, 24, 8, 30, tzinfo=timezone(timedelta(hours=3)))

    bins, records_read = service.aggregate_normalized_rows(
        rows, aggregation_interval=60, recording_start=start,
    )

    assert records_read == 4
    assert [item["vehicle_count"] for item in bins] == [2, 1]
    assert [item["time_bucket"].minute for item in bins] == [30, 33]
    assert all(item["time_bucket"].tzinfo is not None for item in bins)


def test_five_sessions_are_partitioned_from_normalized_parquet(tmp_path) -> None:
    session_ids = [uuid4() for _ in range(5)]
    values = [
        [(1, 0), (1, 15), (2, 20)],
        [(1, 0), (3, 61)],
        [(1, 0), (2, 0), (2, 20), (4, 60)],
        [(1, 0)],
        [(1, 0), (2, 0), (2, 120)],
    ]
    rows = [row for session_rows in values for row in session_rows]
    path = tmp_path / "normalized.parquet"
    pq.write_table(pa.table({
        "track_id": [track for track, _ in rows],
        "timestamp": [time for _, time in rows],
    }), path)
    sessions = [SimpleNamespace(id=session_id) for session_id in session_ids]
    history = SimpleNamespace(parameters={
        "source_session_row_counts": {
            str(session_id): len(session_rows)
            for session_id, session_rows in zip(session_ids, values)
        },
    })
    start = datetime(2018, 10, 24, 8, 30, tzinfo=timezone(timedelta(hours=3)))

    with pq.ParquetFile(path) as parquet_file:
        counts = service._session_row_counts(
            None, history, sessions, parquet_file.metadata.num_rows,
        )
        columns = service._normalized_columns(parquet_file)
        source = service._normalized_pairs(parquet_file, *columns)
        outputs = [
            service.aggregate_normalized_rows(
                islice(source, count), aggregation_interval=60, recording_start=start,
            )[0]
            for count in counts
        ]

    assert [len(output) for output in outputs] == [1, 2, 2, 1, 2]
    assert [[bin_["vehicle_count"] for bin_ in output] for output in outputs] == [
        [2], [1, 1], [2, 1], [1], [2, 1],
    ]
    assert sum(map(len, outputs)) == 8


def test_invalid_timestamp_fails_only_its_session() -> None:
    with pytest.raises(service.SessionAggregationError, match="Invalid normalized timestamp"):
        service.aggregate_normalized_rows(
            [(1, "not-a-time")], aggregation_interval=60, recording_start=None,
        )


def test_legacy_version_uses_saved_session_counts_when_source_csv_is_missing(monkeypatch) -> None:
    version_id = uuid4()
    session_ids = [uuid4(), uuid4()]
    sessions = [SimpleNamespace(id=session_id) for session_id in session_ids]
    history = SimpleNamespace(dataset_version_id=version_id, parameters={})
    saved = {}
    counts = {str(session_ids[0]): 2, str(session_ids[1]): 3}
    monkeypatch.setattr(
        service.repo, "get_historical_session_row_counts",
        lambda db, version, ids: counts,
    )
    monkeypatch.setattr(
        service.repo, "save_session_row_counts",
        lambda db, record, value: saved.update(value),
    )
    monkeypatch.setattr(
        service, "_count_normalized_points",
        lambda session: pytest.fail("source CSV must not be read"),
    )

    assert service._session_row_counts(None, history, sessions, 5) == [2, 3]
    assert saved == counts


def test_legacy_row_count_fallback_matches_pneuma_expansion(tmp_path, monkeypatch) -> None:
    path = tmp_path / "source.csv"
    path.write_text(
        "track_id,type,traveled_d,avg_speed,lat,lon,speed,lon_acc,lat_acc,time\n"
        "1,Bus,1,5,37,23,2,0,0,0,37,23,2,0,0,1\n"
        "2,Car,1,5,37,23,2,0,0,0\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(service, "resolve_stored_file_path", lambda stored: path)
    session = SimpleNamespace(id=uuid4(), file_path="source.csv")

    assert service._count_normalized_points(session) == 3


def test_unapproved_version_is_rejected(monkeypatch) -> None:
    dataset_id = uuid4()
    group_id = uuid4()
    monkeypatch.setattr(
        service.crud_dataset, "get_dataset_by_id",
        lambda db, id_: SimpleNamespace(id=dataset_id, group_id=group_id),
    )
    monkeypatch.setattr(service.crud_dataset, "get_dataset_latest_approved_version", lambda *_: None)
    monkeypatch.setattr(service, "check_dataset_access", lambda *args: None)

    with pytest.raises(HTTPException) as error:
        service.create_temporal_aggregation(
            None,
            SimpleNamespace(role_id="data_scientist"),
            GroupDatasetTemporalAggregationRequest(group_id=group_id, dataset_id=dataset_id),
        )
    assert error.value.status_code == 403


def test_data_scientist_without_dataset_grant_is_rejected(monkeypatch) -> None:
    dataset_id = uuid4()
    group_id = uuid4()
    monkeypatch.setattr(
        service.crud_dataset, "get_dataset_by_id",
        lambda db, id_: SimpleNamespace(id=dataset_id, group_id=group_id),
    )

    def deny_access(user: Any, id_: Any, db: Any) -> None:
        raise HTTPException(403, "Dataset access has not been granted")

    monkeypatch.setattr(service, "check_dataset_access", deny_access)
    with pytest.raises(HTTPException) as error:
        service.create_temporal_aggregation(
            None,
            SimpleNamespace(role_id="data_scientist"),
            GroupDatasetTemporalAggregationRequest(group_id=group_id, dataset_id=dataset_id),
        )
    assert error.value.status_code == 403


def test_dataset_from_another_group_is_rejected(monkeypatch) -> None:
    dataset_id = uuid4()
    monkeypatch.setattr(
        service.crud_dataset, "get_dataset_by_id",
        lambda *_: SimpleNamespace(id=dataset_id, group_id=uuid4()),
    )
    with pytest.raises(HTTPException) as error:
        service.create_temporal_aggregation(
            None,
            SimpleNamespace(role_id="data_scientist"),
            GroupDatasetTemporalAggregationRequest(group_id=uuid4(), dataset_id=dataset_id),
        )
    assert error.value.status_code == 404


def test_create_uses_latest_approved_version_and_all_sessions(monkeypatch) -> None:
    group_id, dataset_id, version_id = uuid4(), uuid4(), uuid4()
    session_ids = [uuid4() for _ in range(5)]
    dataset = SimpleNamespace(id=dataset_id, group_id=group_id)
    version = SimpleNamespace(id=version_id, approval_status="APPROVED")
    selected = []
    monkeypatch.setattr(service.crud_dataset, "get_dataset_by_id", lambda *_: dataset)
    monkeypatch.setattr(
        service.crud_dataset, "get_dataset_latest_approved_version",
        lambda db, id_: (dataset, version),
    )
    monkeypatch.setattr(service, "check_dataset_access", lambda *_: None)
    monkeypatch.setattr(
        service.repo, "get_cleaning_history",
        lambda *_: SimpleNamespace(parameters={"is_pneuma": True}),
    )
    monkeypatch.setattr(service, "_normalized_path", lambda *_: None)
    monkeypatch.setattr(
        service, "_source_sessions",
        lambda *_: [SimpleNamespace(id=session_id) for session_id in session_ids],
    )
    monkeypatch.setattr(service.repo, "get_active_temporal_run", lambda *_: None)
    monkeypatch.setattr(
        service.repo, "create_temporal_run",
        lambda db, job, results: selected.append((job, results)),
    )

    job, results = service.create_temporal_aggregation(
        None,
        SimpleNamespace(role_id="data_scientist"),
        GroupDatasetTemporalAggregationRequest(group_id=group_id, dataset_id=dataset_id),
    )

    assert job.dataset_version_id == version_id
    assert job.job_metadata["group_id"] == str(group_id)
    assert job.total_sessions == 5
    assert {result.session_id for result in results} == set(session_ids)
    assert selected[0][0] is job


def test_group_id_creates_one_public_run_for_all_datasets(monkeypatch) -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), group_id=group_id) for _ in range(4)]
    saved = {}
    monkeypatch.setattr(service.crud_dataset, "get_dataset_group_by_id", lambda *_: object())
    monkeypatch.setattr(service.crud_dataset, "list_group_datasets", lambda *_: datasets)

    def prepare(db, user, payload, *, persist):
        assert persist is False
        job_id = uuid4()
        job = SimpleNamespace(
            id=job_id, dataset_id=payload.dataset_id,
            dataset_version_id=uuid4(), aggregation_interval=60,
            status="PROCESSING", total_sessions=5, completed_sessions=0,
            failed_sessions=0, job_metadata={"group_id": str(group_id)},
        )
        rows = [SimpleNamespace(
            aggregation_id=job_id, session_id=uuid4(), status="QUEUED",
            time_bins=0, records_read=0, error_message=None,
        ) for _ in range(5)]
        return job, rows

    monkeypatch.setattr(service, "create_temporal_aggregation", prepare)
    monkeypatch.setattr(
        service.repo, "create_group_temporal_runs",
        lambda db, jobs, results: saved.update(jobs=jobs, results=results),
    )
    jobs, results = service.create_group_temporal_aggregation(
        None, SimpleNamespace(role_id="data_scientist"),
        GroupTemporalAggregationRequest(group_id=group_id),
    )
    response = service.serialize_group_aggregation_run(jobs, results)
    assert len(saved["jobs"]) == 4
    assert len(saved["results"]) == 20
    assert response.aggregation_id == jobs[0].id
    assert response.total_datasets == 4
    assert response.total_sessions == 20
    assert {item.dataset_id for item in response.sessions} == {item.id for item in datasets}
    assert jobs[0].job_metadata["group_job_ids"] == [str(job.id) for job in jobs]


def test_group_creation_does_not_save_partial_jobs_on_validation_error(monkeypatch) -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), group_id=group_id) for _ in range(2)]
    monkeypatch.setattr(service.crud_dataset, "get_dataset_group_by_id", lambda *_: object())
    monkeypatch.setattr(service.crud_dataset, "list_group_datasets", lambda *_: datasets)

    def prepare(db, user, payload, *, persist):
        assert persist is False
        if payload.dataset_id == datasets[1].id:
            raise HTTPException(403, "Dataset has no approved version")
        return SimpleNamespace(id=uuid4()), []

    monkeypatch.setattr(service, "create_temporal_aggregation", prepare)
    monkeypatch.setattr(
        service.repo, "create_group_temporal_runs",
        lambda *_: pytest.fail("must not save incomplete group"),
    )
    with pytest.raises(HTTPException) as error:
        service.create_group_temporal_aggregation(
            None, SimpleNamespace(role_id="data_scientist"),
            GroupTemporalAggregationRequest(group_id=group_id),
        )
    assert error.value.status_code == 403


def test_group_results_page_contains_dataset_and_session_ids(monkeypatch) -> None:
    root_id, group_id = uuid4(), uuid4()
    jobs = [SimpleNamespace(
        id=job_id, dataset_id=uuid4(), dataset_version_id=uuid4(),
        status="COMPLETED", total_sessions=1, completed_sessions=1,
        failed_sessions=0, aggregation_interval=60,
        job_metadata={"group_id": str(group_id), "group_job_ids": [str(root_id)]},
    ) for job_id in (root_id, uuid4())]
    results = [SimpleNamespace(
        aggregation_id=job.id, session_id=uuid4(), status="COMPLETED",
        time_bins=2, records_read=100, error_message=None,
    ) for job in jobs]
    timestamp = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    row = SimpleNamespace(
        recording_session_id=str(results[1].session_id),
        time_bucket=timestamp, vehicle_count=12,
    )
    monkeypatch.setattr(service, "_accessible_run", lambda *_: jobs[0])
    monkeypatch.setattr(service, "_accessible_group_jobs", lambda *_: jobs)
    monkeypatch.setattr(service, "_group_session_results", lambda *_: results)
    monkeypatch.setattr(service, "_group_recording_starts", lambda *_: {})
    monkeypatch.setattr(service.repo, "count_group_temporal_series", lambda *_: 4)
    monkeypatch.setattr(service.repo, "page_group_temporal_series", lambda *_: [(row, jobs[1])])

    response = service.get_temporal_aggregation_results(
        None, SimpleNamespace(), root_id, None, 2, 1,
    )
    assert response.total_datasets == 2
    assert response.total_sessions == 2
    assert response.total_records == 4
    assert response.total_pages == 4
    assert response.data[0].dataset_id == jobs[1].dataset_id
    assert response.data[0].session_id == results[1].session_id
    assert response.sessions[0].dataset_id == jobs[0].dataset_id


def test_results_show_recording_local_time_without_changing_saved_utc(monkeypatch) -> None:
    aggregation_id = uuid4()
    dataset_id = uuid4()
    version_id = uuid4()
    session_id = uuid4()
    stored_time = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    job = SimpleNamespace(
        id=aggregation_id, dataset_id=dataset_id, dataset_version_id=version_id,
        aggregation_interval=60, status="COMPLETED", total_sessions=1,
        job_metadata={"group_id": str(uuid4())},
    )
    result = SimpleNamespace(
        session_id=session_id, status="COMPLETED", time_bins=1,
        records_read=2, error_message=None,
    )
    monkeypatch.setattr(service, "_accessible_run", lambda db, user, id_: job)
    monkeypatch.setattr(service.repo, "list_temporal_session_results", lambda db, id_: [result])
    monkeypatch.setattr(service.repo, "count_temporal_time_series", lambda *args: 1)
    monkeypatch.setattr(
        service.repo, "page_temporal_time_series",
        lambda *args: [SimpleNamespace(
            recording_session_id=str(session_id), time_bucket=stored_time, vehicle_count=2,
        )],
    )
    monkeypatch.setattr(
        service.repo, "get_sessions_by_ids",
        lambda db, id_, ids: [SimpleNamespace(
            id=session_id, original_filename="20181024_d1_0830_0900.csv",
        )],
    )

    response = service.get_temporal_aggregation_results(
        None, None, aggregation_id, session_id, 1, 20,
    )

    assert response.data[0].timestamp.isoformat() == "2018-10-24T08:30:00+03:00"
    assert response.dataset_id == dataset_id
    assert response.group_id == UUID(job.job_metadata["group_id"])
    assert stored_time.isoformat() == "2018-10-24T05:30:00+00:00"


def test_combined_results_keep_partial_status_and_recording_local_time(monkeypatch) -> None:
    aggregation_id = uuid4()
    dataset_id = uuid4()
    session_ids = [uuid4(), uuid4()]
    job = SimpleNamespace(
        id=aggregation_id, dataset_id=dataset_id, dataset_version_id=uuid4(),
        aggregation_interval=60, status="PARTIAL_SUCCESS", total_sessions=2,
        completed_sessions=1, failed_sessions=1,
        job_metadata={"group_id": str(uuid4())},
    )
    results = [
        SimpleNamespace(
            session_id=session_ids[0], status="COMPLETED", time_bins=1,
            records_read=10, error_message=None,
        ),
        SimpleNamespace(
            session_id=session_ids[1], status="FAILED", time_bins=0,
            records_read=0, error_message="Invalid timestamp",
        ),
    ]
    monkeypatch.setattr(service, "_accessible_run", lambda db, user, id_: job)
    monkeypatch.setattr(service.repo, "list_temporal_session_results", lambda db, id_: results)
    monkeypatch.setattr(
        service.repo, "get_sessions_by_ids",
        lambda db, id_, ids: [SimpleNamespace(
            id=session_id, original_filename="20181024_d1_0830_0900.csv",
        ) for session_id in session_ids],
    )
    monkeypatch.setattr(
        service.repo, "list_temporal_time_series",
        lambda db, id_: [SimpleNamespace(
            recording_session_id=str(session_ids[0]),
            time_bucket=datetime(2018, 10, 24, 5, 30, tzinfo=UTC),
            vehicle_count=4,
        )],
    )

    response = service.get_combined_temporal_aggregation_results(
        None, None, aggregation_id,
    )

    assert response.status == "PARTIAL_SUCCESS"
    assert response.dataset_id == dataset_id
    assert response.group_id == UUID(job.job_metadata["group_id"])
    assert response.failed_sessions == 1
    assert response.timezone == "Europe/Athens"
    assert response.data[0].timestamp.isoformat() == "2018-10-24T08:30:00+03:00"
    assert response.data[0].vehicle_count == 4
    assert response.data[0].session_id == session_ids[0]
