"""One vehicle-count lag convention shared by training and prediction."""

from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from uuid import UUID

MINUTE = timedelta(seconds=60)
HORIZONS = (1, 3, 5)


@dataclass(frozen=True)
class VehicleObservation:
    dataset_id: UUID
    session_id: UUID
    timestamp: datetime
    vehicle_count: int


@dataclass(frozen=True)
class LagWindow:
    dataset_id: UUID
    session_id: UUID
    timestamp: datetime
    lags: tuple[int, int, int, int, int]
    targets: tuple[int, int, int]


def _utc(timestamp: datetime) -> datetime:
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError("Aggregation timestamp must contain a timezone")
    return timestamp.astimezone(UTC)


def _valid_count(value: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def latest_lags(rows: Sequence[VehicleObservation]) -> tuple[datetime, tuple[int, int, int, int, int]]:
    """Use only the latest five minutes from one Session; never search backward across a gap."""
    if not rows or len({(row.dataset_id, row.session_id) for row in rows}) != 1:
        raise ValueError("Prediction requires observations from exactly one Session")
    ordered = sorted(rows, key=lambda row: _utc(row.timestamp))
    recent = ordered[-5:]
    if len(recent) != 5 or any(not _valid_count(row.vehicle_count) for row in recent):
        raise ValueError("Prediction requires five valid observed minutes")
    if any(_utc(right.timestamp) - _utc(left.timestamp) != MINUTE for left, right in pairwise(recent)):
        raise ValueError("Latest five Session minutes must be consecutive and unique")
    return _utc(recent[-1].timestamp), tuple(row.vehicle_count for row in reversed(recent))


def build_training_windows(rows: Sequence[VehicleObservation]) -> list[LagWindow]:
    """Only ten observed consecutive minutes can form five lags plus a +5 target."""
    groups: dict[tuple[UUID, UUID], list[VehicleObservation]] = defaultdict(list)
    for row in rows:
        groups[row.dataset_id, row.session_id].append(row)
    windows: list[LagWindow] = []
    for (dataset_id, session_id), group in groups.items():
        ordered = sorted(group, key=lambda row: _utc(row.timestamp))
        duplicated = {timestamp for timestamp, n in Counter(_utc(row.timestamp) for row in ordered).items() if n > 1}
        segment: list[VehicleObservation] = []
        for row in ordered:
            timestamp = _utc(row.timestamp)
            if timestamp in duplicated or not _valid_count(row.vehicle_count):
                segment.clear()
                continue
            if segment and timestamp - _utc(segment[-1].timestamp) != MINUTE:
                segment.clear()
            segment.append(row)
            if len(segment) < 10:
                continue
            history = segment[-10:-5]
            current = history[-1]
            future = segment[-5:]
            windows.append(LagWindow(
                dataset_id=dataset_id, session_id=session_id,
                timestamp=_utc(current.timestamp),
                lags=tuple(point.vehicle_count for point in reversed(history)),
                targets=(future[0].vehicle_count, future[2].vehicle_count, future[4].vehicle_count),
            ))
    return sorted(windows, key=lambda row: (str(row.dataset_id), str(row.session_id), row.timestamp))
