"""Two scientists may share source grants without sharing private research outputs."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import JSON, Column, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import dataset_access, ds_temporal_aggregation, model_training
from app.core.deps import get_current_user
from app.crud import crud_model_training_experiments, crud_traffic_aggregation
from app.database.database import get_db
from app.models.dataset import (
    DataCleaningHistory,
    Dataset,
    DatasetAccessGrant,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    RecordingSession,
)
from app.models.lag_feature import LagFeatureGeneration, LagFeatureSplit
from app.models.model_training import ModelTrainingExperiment
from app.models.traffic import TrafficAggregationJob, TrafficAggregationSessionResult
from app.models.user import User
from app.schemas.traffic_aggregation import GroupTemporalAggregationRequest
from app.services import ds_temporal_aggregation_service as aggregation
from app.services import prediction_service


@pytest.fixture
def research():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    metadata = MetaData()
    for model in (User, DatasetGroup, Dataset, DatasetFile, DatasetAccessGrant,
                  RecordingSession, DatasetFileSession, DataCleaningHistory,
                  TrafficAggregationJob, TrafficAggregationSessionResult,
                  LagFeatureGeneration, LagFeatureSplit, ModelTrainingExperiment):
        Table(model.__tablename__, metadata, *[
            Column(column.name, JSON() if isinstance(column.type, JSONB) else column.type,
                   primary_key=column.primary_key)
            for column in model.__table__.columns
        ])
    metadata.create_all(engine)
    with Session(engine) as db:
        users = [SimpleNamespace(id=uuid4(), role_id="data_scientist") for _ in range(3)]
        group = DatasetGroup(id=uuid4(), name="Batch", source="pneuma", drone_id="d1")
        datasets = [Dataset(id=uuid4(), name=f"day-{i}", code=f"day-{i}", source="pNEUMA",
                            location_name="Athens", group_id=group.id, drone_id="d1",
                            recording_date=date(2018, 10, 24 + i)) for i in range(2)]
        dataset_files = [DatasetFile(id=uuid4(), dataset_id=item.id, 
                                   approval_status="APPROVED") for item in datasets]
        db.add_all([group, *datasets, *dataset_files])
        for user, item in ((users[0], datasets[0]), (users[1], datasets[0]),
                           (users[1], datasets[1])):
            db.add(DatasetAccessGrant(dataset_id=item.id, user_id=user.id))
        jobs, experiments, generations, splits = [], [], [], []
        for index, owner in enumerate([users[0], users[1], users[0]]):
            job_id = uuid4()
            extra = {"created_by": str(owner.id)} if index < 2 else {}
            job = TrafficAggregationJob(
                id=job_id, dataset_id=datasets[0].id, dataset_file_id=dataset_files[0].id,
                status="COMPLETED", job_metadata={"workflow": "ds_temporal_v1",
                    "group_id": str(group.id), "group_root_id": str(job_id),
                    "group_job_ids": [str(job_id)], **extra},
            )
            generation = LagFeatureGeneration(id=uuid4(), aggregation_id=job.id,
                configuration_hash=str(index), configuration={}, status="COMPLETED")
            split = LagFeatureSplit(id=uuid4(), feature_generation_id=generation.id,
                                    configuration_hash=str(index), status="COMPLETED")
            experiment = ModelTrainingExperiment(
                id=uuid4(), name=f"Experiment-{index}", lag_feature_split_id=split.id,
                created_by=owner.id, configuration={}, evaluation={}, status="COMPLETED",
                created_at=datetime.now(UTC),
            )
            db.add_all([job, generation, split, experiment])
            jobs.append(job); experiments.append(experiment)
            generations.append(generation); splits.append(split)
        db.commit()
        actor = SimpleNamespace(id=users[0].id, role_id="data_scientist")
        app = FastAPI()
        app.include_router(dataset_access.router, prefix="/datasets")
        app.include_router(dataset_access.approved_router, prefix="/datasets")
        app.include_router(model_training.router, prefix="/api")
        app.include_router(ds_temporal_aggregation.router, prefix="/aggregations")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: actor
        with TestClient(app) as client:
            yield SimpleNamespace(db=db, client=client, actor=actor, users=users, group=group,
                                  datasets=datasets, jobs=jobs, experiments=experiments,
                                  generations=generations, splits=splits)
    engine.dispose()


def test_same_dataset_grant_does_not_expose_another_scientists_experiments(research) -> None:
    r = research
    seen = []
    for owner in r.users:
        r.actor.id = owner.id
        response = r.client.get("/api/model-training/experiments?page_size=1")
        assert response.status_code == 200, response.text
        page = response.json()
        seen.append(page["total_records"])
        assert all(row["experiment_id"] in {
            str(item.id) for item in r.experiments if item.created_by == owner.id
        } for row in page["data"])
    assert seen == [2, 1, 0]
    r.actor.id = r.users[0].id
    foreign = r.experiments[1]
    for suffix in ("", "/models", "/predictions", "/forecast-origin-analysis"):
        response = r.client.get(f"/api/model-training/experiments/{foreign.id}{suffix}")
        assert response.status_code == 404, response.text
    with pytest.raises(HTTPException) as exc:
        prediction_service._experiment_scope(r.db, r.actor, foreign.id)
    assert exc.value.status_code == 404
    # Owner filtering is part of the DB query, before pagination.
    rows = crud_model_training_experiments.list_experiments(r.db, split_id=None, status=None,
        offset=0, limit=1, owner_id=r.users[1].id)
    assert [item.id for item in rows] == [foreign.id]


def test_catalog_is_granted_per_account_and_new_scientist_has_no_data(research) -> None:
    r = research
    for owner, expected in zip(r.users, (1, 2, 0)):
        r.actor.id = owner.id
        response = r.client.get("/datasets/accessible-groups")
        assert response.status_code == 200, response.text
        assert sum(item["approved_datasets"] for item in response.json()) == expected
        approved = r.client.get("/datasets/approved")
        assert approved.status_code == 200, approved.text
        assert sum(item["total_datasets"] for item in approved.json()) == expected


def test_aggregation_restore_and_direct_results_only_use_own_runs(research) -> None:
    r = research
    r.actor.id = r.users[1].id
    response = r.client.get(f"/aggregations/groups/{r.group.id}/latest")
    assert response.status_code == 200, response.text
    assert response.json()["aggregation_id"] == str(r.jobs[1].id)
    assert r.client.get(f"/aggregations/{r.jobs[0].id}/results").status_code == 404
    assert r.client.get(f"/aggregations/{r.jobs[2].id}/combined-results").status_code == 404
    r.actor.id = r.users[0].id
    assert aggregation.temporal_job_visible(r.db, r.actor, r.jobs[2])
    assert crud_traffic_aggregation.legacy_temporal_owner_ids(r.db, r.jobs[2].id) == {r.actor.id}
    r.actor.id = r.users[2].id
    assert r.client.get(f"/aggregations/groups/{r.group.id}/latest").status_code == 404


def test_legacy_unattributed_run_is_not_assigned_to_a_new_account(research) -> None:
    r = research
    job = r.jobs[2]
    r.db.delete(r.experiments[2]); r.db.commit()
    assert not aggregation.temporal_job_visible(r.db, r.actor, job)
    assert r.db.get(TrafficAggregationJob, job.id) is not None


def test_admin_still_reads_all_experiments(research) -> None:
    r = research
    r.actor.role_id = "admin"
    response = r.client.get("/api/model-training/experiments")
    assert response.status_code == 200, response.text
    assert response.json()["total_records"] == 3


def test_group_aggregation_only_selects_granted_datasets(research, monkeypatch) -> None:
    r = research
    observed = []
    def create_child(db, user, payload, *, persist):
        observed.append(payload.dataset_id)
        return TrafficAggregationJob(id=uuid4(), dataset_id=payload.dataset_id,
            job_metadata={"created_by": str(user.id)}), []
    monkeypatch.setattr(aggregation, "create_temporal_aggregation", create_child)
    monkeypatch.setattr(aggregation.repo, "create_group_temporal_runs", lambda *_: None)
    aggregation.create_group_temporal_aggregation(r.db, r.actor,
        GroupTemporalAggregationRequest(group_id=r.group.id))
    assert observed == [r.datasets[0].id]
    r.actor.id = r.users[2].id
    with pytest.raises(HTTPException):
        aggregation.create_group_temporal_aggregation(r.db, r.actor,
            GroupTemporalAggregationRequest(group_id=r.group.id))
    assert observed == [r.datasets[0].id]
