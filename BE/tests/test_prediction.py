"""Manual prediction: lag invariants, request validation and opt-in real-DB flow."""

import os
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete, select

from app.core.deps import get_current_user
from app.database.database import SessionLocal, get_db
from app.main import app
from app.models.prediction import PredictionRun
from app.models.user import User
from app.schemas.prediction import ForecastRequest
from app.services import prediction_service as service
from app.services.lag_window_service import VehicleObservation, latest_lags


def test_prediction_timestamps_use_athens_offset_for_recording_date() -> None:
    winter_origin = datetime(2018, 11, 1, 6, 14, tzinfo=UTC)
    winter_display = service._display_time(winter_origin)
    assert winter_display.isoformat() == "2018-11-01T08:14:00+02:00"
    assert service._display_iso("2018-11-01T06:14:00+00:00") == winter_display.isoformat()
    assert (winter_display + timedelta(minutes=1)).isoformat() == "2018-11-01T08:15:00+02:00"
    assert winter_display.astimezone(UTC) == winter_origin

    summer_origin = datetime(2018, 7, 1, 6, 14, tzinfo=UTC)
    summer_display = service._display_time(summer_origin)
    assert summer_display.isoformat() == "2018-07-01T09:14:00+03:00"
    assert summer_display.tzinfo == ZoneInfo("Europe/Athens")


def test_only_vietnamese_prediction_routes_are_documented() -> None:
    paths = app.openapi()["paths"]
    assert "/api/model-training/predict" not in paths
    assert "/api/predictions" not in paths
    expected = {
        "/api/prediction/experiments": "Danh sách thí nghiệm đã hoàn thành để dự báo",
        "/api/prediction/sessions": "Danh sách phiên ghi hình đã tổng hợp và khả năng dự báo",
        "/api/prediction/forecasts": "Dự báo từ 5 phút gần nhất bằng thí nghiệm đã chọn",
        "/api/prediction/forecasts/{forecast_id}": "Chi tiết dự báo và dữ liệu đầu vào đã lưu",
        "/api/prediction/forecasts/{forecast_id}/results": "Kết quả dự báo theo phiên và mốc thời gian, có phân trang",
        "/api/prediction/forecasts/{forecast_id}/chart": "Biểu đồ 5 phút quan sát và 3 mốc dự báo của một phiên",
    }
    for path, summary in expected.items():
        operation = paths[path]["post" if path == "/api/prediction/forecasts" else "get"]
        assert operation["tags"] == ["Dự báo lưu lượng giao thông"]
        assert operation["summary"] == summary
    assert paths["/api/prediction/forecasts"]["get"]["summary"] == "Lịch sử dự báo có phân trang"


def test_latest_lags_use_only_five_observed_minutes_from_one_session() -> None:
    dataset_id, session_id = uuid4(), uuid4()
    start = datetime(2018, 10, 24, 6, 10, tzinfo=UTC)
    observations = [VehicleObservation(dataset_id, session_id, start + timedelta(minutes=i), 120 + i)
                    for i in range(5)]
    origin, lags = latest_lags(observations)
    assert origin == start + timedelta(minutes=4)
    assert lags == (124, 123, 122, 121, 120)
    assert [origin + timedelta(minutes=h) for h in (1, 3, 5)] == [
        start + timedelta(minutes=i) for i in (5, 7, 9)
    ]
    with pytest.raises(ValueError):
        latest_lags(observations[:-1] + [VehicleObservation(dataset_id, uuid4(), observations[-1].timestamp, 124)])
    with pytest.raises(ValueError):
        latest_lags(observations[:-1] + [VehicleObservation(dataset_id, session_id, start + timedelta(minutes=7), 124)])


def test_forecast_request_rejects_invalid_horizon_and_duplicate_sessions() -> None:
    experiment_id, session_id = uuid4(), uuid4()
    with pytest.raises(ValidationError):
        ForecastRequest(experiment_id=experiment_id, session_ids=[session_id, session_id])
    user = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    with pytest.raises(HTTPException) as invalid_horizon:
        service.create_forecast(SimpleNamespace(), user, ForecastRequest(
            experiment_id=experiment_id, session_ids=[session_id], forecast_horizons=[2],
        ))
    assert invalid_horizon.value.detail["code"] == "INVALID_HORIZON"
    with pytest.raises(HTTPException) as invalid_origin:
        service.create_forecast(SimpleNamespace(), user, ForecastRequest(
            experiment_id=experiment_id, session_ids=[session_id], forecast_origin="ARBITRARY",
        ))
    assert invalid_origin.value.detail["code"] == "INVALID_FORECAST_ORIGIN"


def test_prediction_rejects_other_roles_and_missing_experiment() -> None:
    with pytest.raises(HTTPException) as denied:
        service.list_experiments(SimpleNamespace(), SimpleNamespace(role_id="business_user"))
    assert denied.value.status_code == 403
    db = SimpleNamespace()
    user = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    original = service.repo.experiment
    try:
        service.repo.experiment = lambda *_: None
        with pytest.raises(HTTPException) as missing:
            service._experiment_scope(db, user, uuid4())
        assert missing.value.detail["code"] == "EXPERIMENT_NOT_FOUND"
    finally:
        service.repo.experiment = original


@pytest.mark.skipif(os.getenv("RUN_PREDICTION_POSTGRES_TESTS") != "1", reason="real PostgreSQL/artifacts opt-in")
def test_seven_prediction_apis_with_saved_artifacts(monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise all operations against the configured local PostgreSQL and saved model volume."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.role_id == "data_scientist"))
        if user is None:
            pytest.skip("No Data Scientist account")
        user_id = user.id
        existing_run_ids = set(db.scalars(select(PredictionRun.id)))

    def db_override():
        with SessionLocal() as db:
            yield db

    def user_override():
        with SessionLocal() as db:
            return db.get(User, user_id)

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    try:
        with TestClient(app) as client:
            listed = client.get("/api/prediction/experiments")
            assert listed.status_code == 200, listed.text
            assert listed.json()["experiments"]
            experiment = listed.json()["experiments"][0]
            assert set(experiment["model_ids"]) == {"1", "3", "5"}
            experiment_id = experiment["experiment_id"]
            sessions = client.get("/api/prediction/sessions", params={
                "experiment_id": experiment_id, "eligible_only": True,
            })
            assert sessions.status_code == 200, sessions.text
            assert sessions.json()["timestamp_timezone"] == "Europe/Athens"
            assert sessions.json()["total_records"] > 0
            session_id = sessions.json()["sessions"][0]["session_id"]
            payload = {"experiment_id": experiment_id, "session_ids": [session_id],
                       "forecast_horizons": [1, 3, 5], "forecast_origin": "LATEST_AVAILABLE"}
            forecast = client.post("/api/prediction/forecasts", json=payload)
            assert forecast.status_code == 201, forecast.text
            result = forecast.json()
            assert result["status"] == "COMPLETED"
            assert result["timestamp_timezone"] == "Europe/Athens"
            assert result["experiment_id"] == experiment_id
            assert result["results_by_session"][0]["lag_features"].keys() == {
                f"lag_{i}" for i in range(1, 6)
            }
            assert client.post("/api/prediction/forecasts", json=payload).json()["forecast_id"] == result["forecast_id"]
            forecast_id = result["forecast_id"]
            history = client.get("/api/prediction/forecasts", params={"experiment_id": experiment_id})
            assert history.status_code == 200
            assert any(item["forecast_id"] == forecast_id for item in history.json()["forecasts"])
            detail = client.get(f"/api/prediction/forecasts/{forecast_id}")
            assert detail.status_code == 200
            assert detail.json()["session_ids"] == [session_id]
            assert detail.json()["session_snapshots"][0]["forecast_origin_time"] == result["results_by_session"][0]["forecast_origin_time"]
            table = client.get(f"/api/prediction/forecasts/{forecast_id}/results", params={
                "session_id": session_id, "page_size": 2,
            })
            assert table.status_code == 200
            assert table.json()["total_records"] == 3
            assert len(table.json()["results"]) == 2
            assert table.json()["timestamp_timezone"] == "Europe/Athens"
            assert all(row["actual_vehicle_count"] is None for row in table.json()["results"])
            origin = datetime.fromisoformat(result["results_by_session"][0]["forecast_origin_time"])
            assert origin.utcoffset() == origin.astimezone(ZoneInfo("Europe/Athens")).utcoffset()
            for point in result["results_by_session"][0]["predictions"]:
                assert datetime.fromisoformat(point["forecast_timestamp"]) == origin + timedelta(minutes=point["horizon"])
                assert point["model_id"] == experiment["model_ids"][str(point["horizon"])]
            chart = client.get(f"/api/prediction/forecasts/{forecast_id}/chart", params={"session_id": session_id})
            assert chart.status_code == 200
            assert len(chart.json()["historical"]) == 5
            assert len(chart.json()["forecast"]) == 3
            assert chart.json()["timestamp_timezone"] == "Europe/Athens"
            assert chart.json()["historical"][-1]["timestamp"] == origin.isoformat()
            absent = client.post("/api/prediction/forecasts", json={
                **payload, "session_ids": [str(uuid4())],
            })
            assert absent.status_code == 404
            assert absent.json()["detail"]["code"] == "SESSION_NOT_FOUND"
            partial = client.post("/api/prediction/forecasts", json={
                **payload, "session_ids": [session_id, str(uuid4())],
            })
            assert partial.status_code == 201
            assert partial.json()["status"] == "PARTIAL"
            assert partial.json()["session_errors"][0]["code"] == "SESSION_NOT_FOUND"
            with monkeypatch.context() as patch:
                def missing_artifact(_forest):
                    raise HTTPException(409, "Saved artifact is missing")

                patch.setattr(service, "_load_forest", missing_artifact)
                missing_model = client.post("/api/prediction/forecasts", json=payload)
                assert missing_model.status_code == 409
                assert missing_model.json()["detail"]["code"] == "MODEL_ARTIFACT_MISSING"
    finally:
        app.dependency_overrides.clear()
        with SessionLocal() as db:
            new_run_ids = set(db.scalars(select(PredictionRun.id))) - existing_run_ids
            if new_run_ids:
                db.execute(delete(PredictionRun).where(PredictionRun.id.in_(new_run_ids)))
                db.commit()
