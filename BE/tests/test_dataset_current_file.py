from uuid import uuid4

import pytest
from sqlalchemy import JSON, BigInteger, Integer, MetaData, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud.crud_dataset import create_normalized_file
from app.models.dataset import DataCleaningHistory, Dataset, DatasetFile, DatasetGroup
from app.models.user import Role, User
from app.schemas.dataset_normalization import DatasetExportRequest, DatasetFileListItem


def test_export_updates_one_current_file_and_preserves_its_id_and_history() -> None:
    metadata = MetaData()
    for model in (Role, User, DatasetGroup, Dataset, DatasetFile, DataCleaningHistory):
        table = model.__table__.to_metadata(metadata)
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()
            elif isinstance(column.type, BigInteger):
                column.type = Integer()
    engine = create_engine("sqlite://")
    metadata.create_all(engine)
    with Session(engine) as db:
        dataset = Dataset(id=uuid4(), name="Current dataset", code="CURRENT_DATASET",
                          source="UAV", location_name="Athens")
        current = DatasetFile(id=uuid4(), dataset_id=dataset.id, file_format="CSV",
                              approval_status="APPROVED", original_filename="recording.csv")
        db.add_all([dataset, current])
        db.commit()
        file_id = current.id
        for records in (10, 25):
            exported, _ = create_normalized_file(
                db, dataset_id=dataset.id, new_file_id=file_id, file_format="PARQUET",
                file_path="processed.parquet", file_size_bytes=500, total_records=records,
                records_before=3, user_id=uuid4(), cleaning_parameters={},
                original_filename="recording.csv",
            )
            assert exported.id == file_id
            assert exported.total_records == records
            assert exported.approval_status == "PENDING"
            assert exported.approved_by is None
            assert db.query(DatasetFile).count() == 1
        assert db.query(DataCleaningHistory).count() == 2
        db.add(DatasetFile(dataset_id=dataset.id, file_format="CSV"))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


def test_export_contract_rejects_removed_tags_and_does_not_expose_them() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DatasetExportRequest.model_validate({"new_version_tag": "v2.0"})
    assert not {"version_id", "version_tag", "version_number", "file_tag", "file_number"} & DatasetFileListItem.model_fields.keys()
    assert "version_tag" not in DatasetFile.__table__.columns
    assert "file_tag" not in DatasetFile.__table__.columns
