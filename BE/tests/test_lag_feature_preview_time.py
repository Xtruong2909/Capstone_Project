"""The feature preview displays recording-local clock times."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.services import lag_feature_service


def test_preview_uses_recording_timezone_across_dst(monkeypatch) -> None:
    generation_id = uuid4()
    dataset_id = uuid4()
    summer_session_id = uuid4()
    winter_session_id = uuid4()

    def sample(session_id, timestamp):
        return SimpleNamespace(
            aggregation_id=uuid4(), dataset_id=dataset_id, session_id=session_id,
            timestamp=timestamp, lag_1=1, lag_2=2, lag_3=3, lag_4=4, lag_5=5,
            target_h1=6, target_h3=7, target_h5=8,
        )

    rows = [
        sample(summer_session_id, datetime(2018, 10, 24, 5, 34, tzinfo=UTC)),
        sample(winter_session_id, datetime(2018, 10, 29, 6, 34, tzinfo=UTC)),
    ]
    sessions = [
        SimpleNamespace(id=summer_session_id, original_filename="20181024_d1_0830_0900.csv"),
        SimpleNamespace(id=winter_session_id, original_filename="20181029_d1_0830_0900.csv"),
    ]
    monkeypatch.setattr(lag_feature_service, "accessible_generation", lambda *_: object())
    monkeypatch.setattr(lag_feature_service.repo, "count_samples", lambda *_: len(rows))
    monkeypatch.setattr(lag_feature_service.repo, "page_samples", lambda *_: rows)
    monkeypatch.setattr(
        lag_feature_service.aggregation_repo, "get_sessions_by_ids", lambda *_: sessions,
    )

    result = lag_feature_service.get_generation_preview(None, None, generation_id, 1, 20)

    assert [item.timestamp.isoformat() for item in result.data] == [
        "2018-10-24T08:34:00+03:00",
        "2018-10-29T08:34:00+02:00",
    ]
    assert [row.timestamp for row in rows] == [
        datetime(2018, 10, 24, 5, 34, tzinfo=UTC),
        datetime(2018, 10, 29, 6, 34, tzinfo=UTC),
    ]


def test_preview_pages_by_two_complete_recording_days(monkeypatch) -> None:
    generation_id = uuid4()
    dataset_id = uuid4()
    dates = [date(2018, 10, 24), date(2018, 10, 29), date(2018, 10, 30)]
    sessions = [
        SimpleNamespace(
            id=uuid4(),
            original_filename=f"{recording_date:%Y%m%d}_d1_0830_0900.csv",
        )
        for recording_date in dates
    ]
    session_dates = dict(zip((session.id for session in sessions), dates))
    samples = [
        SimpleNamespace(
            aggregation_id=uuid4(), dataset_id=dataset_id, session_id=session.id,
            timestamp=datetime(2018, 10, recording_date.day, 6, 34, tzinfo=UTC),
            lag_1=1, lag_2=2, lag_3=3, lag_4=4, lag_5=5,
            target_h1=6, target_h3=7, target_h5=8,
        )
        for session, recording_date in zip(sessions, dates)
    ]
    samples.insert(1, SimpleNamespace(**{
        **vars(samples[0]), "timestamp": datetime(2018, 10, 24, 6, 35, tzinfo=UTC),
    }))

    monkeypatch.setattr(lag_feature_service, "accessible_generation", lambda *_: object())
    monkeypatch.setattr(lag_feature_service.repo, "count_samples", lambda *_: len(samples))
    monkeypatch.setattr(lag_feature_service.repo, "list_sample_recording_dates", lambda *_: dates)
    monkeypatch.setattr(
        lag_feature_service.repo, "samples_for_recording_dates",
        lambda _db, _id, selected: [
            sample for sample in samples if session_dates[sample.session_id] in selected
        ],
    )
    monkeypatch.setattr(
        lag_feature_service.aggregation_repo, "get_sessions_by_ids",
        lambda _db, _dataset, ids: [session for session in sessions if session.id in ids],
    )

    first = lag_feature_service.get_generation_preview(None, None, generation_id, 1, 20, 2)
    second = lag_feature_service.get_generation_preview(None, None, generation_id, 2, 20, 2)

    assert first.pagination_unit == "days"
    assert first.recording_dates == dates[:2]
    assert first.total_days == 3
    assert first.total_pages == 2
    assert len(first.data) == 3
    assert second.recording_dates == dates[2:]
    assert len(second.data) == 1
