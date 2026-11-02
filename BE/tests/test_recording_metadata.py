from types import SimpleNamespace
from uuid import uuid4

from app.crud import crud_recording_metadata as metadata
from app.services import traffic_aggregation_service as service


def test_known_filename_never_requires_history_lookup(monkeypatch) -> None:
    def unexpected_lookup(*args: object) -> None:
        raise AssertionError("Existing filenames must be preserved")

    monkeypatch.setattr(metadata, "recoverable_original_filenames", unexpected_lookup)
    assert metadata.resolve_original_filename(
        None, dataset_id=uuid4(), version_id=uuid4(), original_filename="original.csv",
    ) == "original.csv"


def test_legacy_version_uses_its_own_lineage_and_recording_start(monkeypatch) -> None:
    dataset_id, version_id, unrelated_id = uuid4(), uuid4(), uuid4()

    def candidates(db: object, requested_dataset: object) -> dict:
        assert requested_dataset == dataset_id
        return {
            version_id: "20181024_d3_1030_1100.csv",
            unrelated_id: "20181024_d1_0830_0900.csv",
        }

    monkeypatch.setattr(metadata, "recoverable_original_filenames", candidates)
    version = SimpleNamespace(id=version_id, dataset_id=dataset_id, original_filename=None)
    assert service._recording_start(None, version).isoformat() == "2018-10-24T10:30:00+03:00"
    assert metadata.resolve_original_filename(
        None, dataset_id=dataset_id, version_id=uuid4(), original_filename=None,
    ) is None


def test_backfill_does_not_commit_or_overwrite_concurrently_updated_name(monkeypatch) -> None:
    first_id, second_id = uuid4(), uuid4()
    monkeypatch.setattr(
        metadata, "recoverable_original_filenames",
        lambda db: {first_id: "first.csv", second_id: "second.csv"},
    )

    class FakeDB:
        def execute(self, statement: object, parameters: dict) -> SimpleNamespace:
            assert "original_filename), '') IS NULL" in str(statement)
            result = first_id if parameters["version_id"] == first_id else None
            return SimpleNamespace(scalar_one_or_none=lambda: result)

    assert metadata.restore_original_filenames(FakeDB()) == {first_id: "first.csv"}
