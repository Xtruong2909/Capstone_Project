"""Opt-in PostgreSQL tests, isolated in a disposable schema (no production rows).

Run with RUN_TRAINING_POSTGRES_TESTS=1 using the configured PostgreSQL connection.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session
from test_model_training import make_split
from test_train_test_split import request_data

from app.api.v1.endpoints import model_training as endpoints
from app.crud import crud_model_training as repository
from app.database.database import engine
from app.schemas.model_training import ExperimentComparisonRequest, TrainingExperimentRequest
from app.schemas.train_test_split import TrainTestSplitRequest
from app.services import model_training_service as service
from app.services import train_test_split_service as splitting

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_TRAINING_POSTGRES_TESTS") != "1", reason="PostgreSQL integration is opt-in"
)


@pytest.fixture
def storage() -> tuple:
    schema = "training_test_" + uuid4().hex
    dataset_id, version_id, user_id = uuid4(), uuid4(), uuid4()
    with engine.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.execute(text("CREATE TABLE datasets (id UUID PRIMARY KEY)"))
        connection.execute(text(
            "CREATE TABLE dataset_versions (id UUID PRIMARY KEY, "
            "dataset_id UUID NOT NULL REFERENCES datasets(id))"
        ))
        connection.execute(text("CREATE TABLE users (id UUID PRIMARY KEY)"))
        connection.execute(text("INSERT INTO datasets VALUES (:id)"), {"id": dataset_id})
        connection.execute(text(
            "INSERT INTO dataset_versions (id, dataset_id) VALUES (:id, :dataset_id)"
        ), {"id": version_id, "dataset_id": dataset_id})
        connection.execute(text("INSERT INTO users VALUES (:id)"), {"id": user_id})
        connection.commit()
        migration = Path("migrations/20261106_model_training.sql").read_text(encoding="utf-8")
        connection.exec_driver_sql(migration)
        connection.commit()
        # Check the migration can be re-applied.
        connection.exec_driver_sql(migration)
        connection.commit()
        logs_migration = Path(
            "migrations/20261107_add_model_training_logs.sql"
        ).read_text(encoding="utf-8")
        connection.exec_driver_sql(logs_migration)
        connection.commit()
        connection.exec_driver_sql(logs_migration)
        connection.commit()
        names_migration = Path(
            "migrations/20261110_experiment_names_per_dataset.sql"
        ).read_text(encoding="utf-8")
        connection.exec_driver_sql(names_migration)
        connection.commit()
        connection.exec_driver_sql(names_migration)
        connection.commit()
        connection.execute(text("SET search_path TO public"))
        connection.commit()
    try:
        yield schema, version_id, user_id, dataset_id
    finally:
        with engine.begin() as connection:
            connection.execute(text("SET search_path TO public"))
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def test_persist_reload_compare_and_concurrent_names(storage: tuple, monkeypatch: pytest.MonkeyPatch) -> None:
    schema, version_id, user_id, _ = storage
    monkeypatch.setattr(service, "require_version", lambda *args, **kwargs: None)
    user = SimpleNamespace(id=user_id, role_id="admin")
    split = make_split()
    split.dataset_version_id = version_id

    def run(n_estimators: int) -> object:
        with engine.connect() as connection:
            connection.execute(text(f'SET search_path TO "{schema}"'))
            connection.commit()


            try:
                with Session(bind=connection) as db:
                    result = endpoints.create_experiment(
                        split_id=repository.save_split(
                            db, version_id, service.split_fingerprint(split),
                            split.model_dump(mode="json"),
                        ).id,
                        n_estimators=n_estimators, max_depth=10, min_samples_split=2,
                        min_samples_leaf=1, max_features="1.0", bootstrap=True,
                        random_state=42, evaluation_mode="exploratory", db=db, user=user,
                    )
                    assert result.status == "COMPLETED"
                    return result
            finally:
                connection.rollback()
                connection.execute(text("SET search_path TO public"))
                connection.commit()

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(run, [3, 4, 5]))
    assert {r.experiment_name for r in results} == {"Ex-001", "Ex-002", "Ex-003"}
    assert len({r.split_id for r in results}) == 1
    with engine.connect() as connection:
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.commit()
        try:
            with Session(bind=connection) as db:
                loaded = endpoints.get_experiment(results[0].experiment_id, db, user)
                assert loaded.model_dump() == results[0].model_dump()
                comparison = endpoints.compare_experiments(ExperimentComparisonRequest(experiment_ids=[r.experiment_id for r in results]), db, user)
                assert len(comparison["experiments"]) == 3
                listed = endpoints.list_experiments(None, 0, 20, db, user)
                assert len(listed) == 3
                reused = service.create_and_run(db, TrainingExperimentRequest(
                    dataset_version_id=version_id, split_id=results[0].split_id,
                    hyperparameters={"n_estimators": 3},
                ), user)
                assert reused.experiment_name == "Ex-004"
                assert reused.split_id == results[0].split_id
                assert repository.get_split(db, reused.split_id).payload == split.model_dump(mode="json")

                new_dataset_id, new_version_id = uuid4(), uuid4()
                db.execute(text("INSERT INTO datasets (id) VALUES (:id)"), {"id": new_dataset_id})
                db.execute(text(
                    "INSERT INTO dataset_versions (id, dataset_id) VALUES (:id, :dataset_id)"
                ), {"id": new_version_id, "dataset_id": new_dataset_id})
                new_split = make_split()
                new_split.dataset_version_id = new_version_id
                first_for_new_dataset = service.create_and_run(
                    db,
                    TrainingExperimentRequest(
                        dataset_version_id=new_version_id, split_result=new_split,
                        hyperparameters={"n_estimators": 3},
                    ),
                    user,
                )
                assert first_for_new_dataset.experiment_name == "Ex-001"
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.commit()


def test_split_api_saves_id_before_first_experiment(storage: tuple, monkeypatch: pytest.MonkeyPatch) -> None:
    schema, version_id, user_id, _ = storage
    monkeypatch.setattr(splitting.crud_dataset_access, "get_version", lambda *a: SimpleNamespace(dataset_id=uuid4()))
    monkeypatch.setattr(splitting, "require_dataset_scientist", lambda **kw: None)
    monkeypatch.setattr(service, "require_version", lambda *a, **kw: None)
    data = request_data(10)
    data["dataset_version_id"] = str(version_id)
    for sample in data["samples"]:
        sample["dataset_version_id"] = str(version_id)
    user = SimpleNamespace(id=user_id, role_id="admin")
    with engine.connect() as connection:
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.commit()
        try:
            with Session(bind=connection) as db:
                first = splitting.prepare_training_split(db, TrainTestSplitRequest.model_validate(data), user)
                second = splitting.prepare_training_split(db, TrainTestSplitRequest.model_validate(data), user)
                assert first.split_id == second.split_id
                assert first.split_id is not None
                result = service.create_from_saved_split(
                    db, first.split_id, {"max_features": "1.0", "n_estimators": 3}, "exploratory", user,
                )
                assert result.status == "COMPLETED"
                assert result.split_id == first.split_id
                assert result.dataset_version_id == version_id
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.commit()


def test_prediction_migration_and_forecast_persistence(storage: tuple) -> None:
    """The additive migration preserves legacy rows and stores idempotent final forecasts."""
    from datetime import UTC, datetime, timedelta
    from decimal import Decimal

    from app.models.model_training import FinalModel, ModelTrainingExperiment, ModelValidationResult

    schema, version_id, user_id, dataset_id = storage
    split = make_split()
    split.dataset_version_id = version_id
    origin = datetime(2018, 10, 24, 6, 48, tzinfo=UTC)
    with engine.connect() as connection:
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.commit()
        try:
            connection.execute(text(
                "CREATE TABLE forecast_results (id BIGSERIAL PRIMARY KEY, "
                "experiment_id UUID NOT NULL, timestamp TIMESTAMPTZ NOT NULL, "
                "horizon_minutes INTEGER NOT NULL, predicted_value NUMERIC(10,2) NOT NULL)"
            ))
            legacy_id = uuid4()
            connection.execute(text(
                "INSERT INTO forecast_results (experiment_id,timestamp,horizon_minutes,predicted_value) "
                "VALUES (:id,:time,1,1.00)"
            ), {"id": legacy_id, "time": origin})
            connection.commit()
            migration = Path("migrations/20261108_model_prediction.sql").read_text(encoding="utf-8")
            connection.exec_driver_sql(migration)
            connection.commit()
            connection.exec_driver_sql(migration)
            connection.commit()
            with Session(bind=connection) as db:
                saved_split = repository.save_split(db, version_id, uuid4().hex,
                                                    split.model_dump(mode="json"))
                experiment = ModelTrainingExperiment(
                    dataset_id=dataset_id, name="Ex-001", split_id=saved_split.id,
                    created_by=user_id, status="COMPLETED",
                    configuration={"model": "RANDOM_FOREST"}, evaluation={},
                )
                db.add(experiment)
                db.commit()
                validation = ModelValidationResult(
                    experiment_id=experiment.id, validation_fingerprint="a" * 64,
                    sample_count=3,
                    performance_by_horizon={str(h): {"mae": 1, "rmse": 2} for h in (1, 3, 5)},
                )
                final = FinalModel(
                    experiment_id=experiment.id, dataset_version_id=version_id,
                    split_id=saved_split.id, roi_identifier="MAIN_ROI",
                    recording_session_id=str(version_id), artifact_path="final.joblib",
                    artifact_sha256="b" * 64, trained_through=origin,
                    feature_order=[f"lag_{i}" for i in range(1, 6)],
                    forecast_horizons=[1, 3, 5], hyperparameters={},
                )
                db.add_all([validation, final])
                db.commit()
                assert repository.list_completed_forests(db, version_id)[0].id == experiment.id
                assert repository.get_validation_result(db, experiment.id).sample_count == 3
                assert repository.get_final_model(db, experiment.id).id == final.id
                forecasts = [(h, origin + timedelta(minutes=h), Decimal("42.50"))
                             for h in (1, 3, 5)]
                repository.save_final_forecasts(db, final.id, origin, forecasts)
                repository.save_final_forecasts(db, final.id, origin, forecasts)
                assert db.scalar(text("SELECT count(*) FROM forecast_results")) == 4
                assert db.scalar(text(
                    "SELECT count(*) FROM forecast_results WHERE experiment_id = :id"
                ), {"id": legacy_id}) == 1
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.commit()
