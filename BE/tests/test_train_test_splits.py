from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.lag_feature import LagTrainTestSplitRequest
from app.services import train_test_splits_service as service


def _records(samples_per_session: list[int]) -> list[tuple[SimpleNamespace, date]]:
    start = datetime(2026, 1, 1, 8, tzinfo=UTC)
    records = []
    for day, sample_count in enumerate(samples_per_session):
        session_id = uuid4()
        dataset_id = uuid4()
        recording_date = start.date() + timedelta(days=day)
        for index in range(sample_count):
            timestamp = start + timedelta(days=day, minutes=index * 10)
            sample = SimpleNamespace(
                id=len(records) + 1,
                dataset_id=dataset_id,
                session_id=session_id,
                timestamp=timestamp,
                **{f"target_h{horizon}": 100 + index + horizon for horizon in (1, 3, 5)},
            )
            records.append((sample, recording_date))
    return records


def test_day_based_keeps_recording_days_whole_and_reports_sample_ratio() -> None:
    plan = service.build_split_plan(_records([2, 3, 4, 5]), "DAY_BASED", 0.7)
    train_dates = {recording_date for _, recording_date in plan.train_rows}
    test_dates = {recording_date for _, recording_date in plan.test_rows}
    train_sessions = {row.session_id for row, _ in plan.train_rows}
    test_sessions = {row.session_id for row, _ in plan.test_rows}

    assert len(train_dates) == 3
    assert len(test_dates) == 1
    assert train_dates.isdisjoint(test_dates)
    assert train_sessions.isdisjoint(test_sessions)
    assert len(plan.train_rows) == 9
    assert len(plan.test_rows) == 5
    assert plan.train_ratio_actual == pytest.approx(9 / 14)
    assert plan.train_ratio_actual != 0.7
    assert plan.warnings == []
    assert plan.samples_by_horizon == {
        f"h{horizon}": {"total": 14, "train": 9, "test": 5}
        for horizon in (1, 3, 5)
    }


def test_session_based_splits_whole_sessions_in_time_order() -> None:
    plan = service.build_split_plan(_records([2] * 20), "SESSION_BASED", 0.7)
    train_sessions = {row.session_id for row, _ in plan.train_rows}
    test_sessions = {row.session_id for row, _ in plan.test_rows}

    assert len(train_sessions) == 14
    assert len(test_sessions) == 6
    assert train_sessions.isdisjoint(test_sessions)
    assert len(plan.train_rows) == 28
    assert len(plan.test_rows) == 12
    assert plan.train_ratio_actual == 0.7


def test_split_rejects_timestamp_overlap_between_train_targets_and_test_history() -> None:
    start = datetime(2026, 1, 1, 8, tzinfo=UTC)
    records = []
    for index, timestamp in enumerate((start, start + timedelta(minutes=4))):
        records.append((SimpleNamespace(
            id=index + 1,
            dataset_id=uuid4(),
            session_id=uuid4(),
            timestamp=timestamp,
            **{f"target_h{horizon}": 1 for horizon in (1, 3, 5)},
        ), start.date()))

    with pytest.raises(HTTPException) as error:
        service.build_split_plan(records, "SESSION_BASED", 0.5)

    assert error.value.status_code == 422
    assert error.value.detail["code"] == "TRAIN_TEST_DATA_LEAKAGE"


def test_split_requires_two_groups_and_both_subsets() -> None:
    with pytest.raises(HTTPException) as error:
        service.build_split_plan(_records([5]), "DAY_BASED", 0.7)

    assert error.value.status_code == 422
    assert "two distinct" in error.value.detail


def test_split_creation_is_idempotent_for_same_configuration(monkeypatch) -> None:
    generation_id = uuid4()
    generation = SimpleNamespace(id=generation_id, status="COMPLETED", sample_count=14)
    records = _records([2, 3, 4, 5])
    saved = {}
    save_calls = []

    def find_split(_db, _generation_id, fingerprint):
        return saved.get(fingerprint)

    def save_split(_db, split, memberships):
        split.created_at = datetime.now(UTC)
        saved[split.configuration_hash] = split
        save_calls.append((split, memberships))
        return split

    monkeypatch.setattr(service, "accessible_generation", lambda *_: generation)
    monkeypatch.setattr(service.repo, "find_split", find_split)
    monkeypatch.setattr(service.repo, "list_generation_samples", lambda *_: records)
    monkeypatch.setattr(service.repo, "save_split", save_split)
    payload = LagTrainTestSplitRequest(
        feature_generation_id=generation_id, split_strategy="DAY_BASED",
    )

    first = service.create_train_test_split(None, None, payload)
    second = service.create_train_test_split(None, None, payload)

    assert first.split_id == second.split_id
    assert first.train_sample_count == 9
    assert first.test_sample_count == 5
    assert len(save_calls) == 1
    memberships = save_calls[0][1]
    assert sum(item.subset == "TRAIN" for item in memberships) == 9
    assert sum(item.subset == "TEST" for item in memberships) == 5


def test_split_requires_completed_feature_generation(monkeypatch) -> None:
    generation = SimpleNamespace(status="PROCESSING")
    monkeypatch.setattr(service, "accessible_generation", lambda *_: generation)

    with pytest.raises(HTTPException) as error:
        service.create_train_test_split(
            None,
            None,
            LagTrainTestSplitRequest(feature_generation_id=uuid4()),
        )

    assert error.value.status_code == 409
    assert "COMPLETED" in error.value.detail


def test_saved_split_response_hides_legacy_ratio_warning() -> None:
    split = SimpleNamespace(
        id=uuid4(),
        feature_generation_id=uuid4(),
        status="COMPLETED",
        split_strategy="DAY_BASED",
        train_ratio_requested=0.7,
        train_ratio_actual=0.72,
        forecast_horizons=[1, 3, 5],
        shuffle=False,
        total_sessions=2,
        train_sessions=[],
        test_sessions=[],
        total_samples=25,
        train_sample_count=18,
        test_sample_count=7,
        samples_by_horizon={},
        leakage_check={
            "checked": True,
            "has_leakage": False,
            "rule": service.SPLIT_LEAKAGE_RULE,
            "train_latest_target_time": datetime(2026, 1, 1, 8, tzinfo=UTC),
            "test_earliest_history_time": datetime(2026, 1, 2, 8, tzinfo=UTC),
        },
        warnings=[
            service.RATIO_DIFFERENCE_WARNING,
            "At least one Train or Test subset contains fewer than two samples.",
        ],
        created_at=datetime.now(UTC),
    )

    response = service._response(split)

    assert response.warnings == [
        "At least one Train or Test subset contains fewer than two samples.",
    ]


def test_preview_filters_requested_subset_and_maps_table_columns(monkeypatch) -> None:
    split_id, session_id, dataset_id = uuid4(), uuid4(), uuid4()
    row = SimpleNamespace(
        dataset_id=dataset_id,
        session_id=session_id,
        timestamp=datetime(2026, 1, 1, 8, tzinfo=UTC),
        **{f"lag_{index}": index for index in range(1, 6)},
        **{f"target_h{horizon}": 10 + horizon for horizon in (1, 3, 5)},
    )
    monkeypatch.setattr(
        service, "get_accessible_split",
        lambda *_: (SimpleNamespace(id=split_id), SimpleNamespace()),
    )
    monkeypatch.setattr(
        service.repo, "page_split_samples",
        lambda *_args: (1, [(row, "TEST")]),
    )

    response = service.preview_train_test_split(
        None, None, split_id, "TEST", 2, 5, session_id,
    )

    assert response.total_records == 1
    assert response.total_pages == 1
    assert response.session_id == session_id
    assert response.data[0].dataset_id == dataset_id
    assert response.data[0].lag_5 == 5
    assert response.data[0].target_h5 == 15
    assert response.data[0].subset == "TEST"
