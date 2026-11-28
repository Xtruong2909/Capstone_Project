"""Comparison compatibility follows membership rather than split labels."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services import model_training_experiment_service as service


def experiment(policy: str) -> SimpleNamespace:
    return SimpleNamespace(
        lag_feature_split_id=uuid4(),
        evaluation={"evaluation_subset": "TEST", "evaluation_policy": policy},
        configuration={"forecast_horizons": [1, 3, 5]},
        library_versions={"implementation": "same-evaluation-v1"},
    )


def test_manual_and_validation_refits_share_key_for_same_membership(monkeypatch: pytest.MonkeyPatch) -> None:
    partition = (str(uuid4()), (1, 3, 5), (("TEST", 3), ("TRAIN", 1), ("TRAIN", 2)))
    monkeypatch.setattr(service.repository, "get_comparison_partition", lambda *_: partition)
    first, second = [experiment(policy) for policy in sorted(service.EQUIVALENT_TEST_POLICIES)]
    assert first.lag_feature_split_id != second.lag_feature_split_id
    assert service._comparison_key(MagicMock(), first) == service._comparison_key(MagicMock(), second)


def test_equal_counts_with_different_train_samples_have_different_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    record = experiment(next(iter(service.EQUIVALENT_TEST_POLICIES)))
    generation = str(uuid4())
    monkeypatch.setattr(service.repository, "get_comparison_partition", lambda *_: (
        generation, (1, 3, 5), (("TEST", 3), ("TRAIN", 1)),
    ))
    first = service._comparison_key(MagicMock(), record)
    monkeypatch.setattr(service.repository, "get_comparison_partition", lambda *_: (
        generation, (1, 3, 5), (("TEST", 3), ("TRAIN", 2)),
    ))
    assert first != service._comparison_key(MagicMock(), record)


def test_validation_candidates_never_share_test_comparison_key() -> None:
    record = experiment(next(iter(service.EQUIVALENT_TEST_POLICIES)))
    record.evaluation["evaluation_subset"] = "VALIDATION"
    assert service._comparison_key(MagicMock(), record) is None
