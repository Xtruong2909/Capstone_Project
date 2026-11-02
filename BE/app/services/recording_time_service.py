"""Resolve pNEUMA relative seconds using the original recording filename."""

import math
import re
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo

UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
RELATIVE_TIME_LIMIT = timedelta(days=1)
RECORDING_NAME = re.compile(
    r"^(?P<date>\d{8})_d(?:\d+|[xX])_(?P<start>\d{4})_(?P<end>\d{4})(?=$|[_.])"
)


def recording_start_from_filename(filename: str | None) -> datetime | None:
    """Only the explicit pNEUMA naming convention implies Europe/Athens time."""
    name = PurePosixPath((filename or "").replace("\\", "/")).name
    match = RECORDING_NAME.match(name)
    if match is None:
        return None
    try:
        zone = ZoneInfo("Europe/Athens")
        start = datetime.strptime(match["date"] + match["start"], "%Y%m%d%H%M").replace(
            tzinfo=zone
        )
        datetime.strptime(match["date"] + match["end"], "%Y%m%d%H%M").replace(tzinfo=zone)
    except ValueError:
        return None
    return start


def recording_timestamp(timestamp: datetime, start: datetime | None) -> datetime:
    """Rebase legacy epoch-relative values and display recording-local time.

    Real absolute timestamps are never shifted, only converted to the local zone.
    The sub-day range distinguishes recording offsets from modern Unix timestamps.
    """
    timestamp = timestamp.replace(tzinfo=UTC) if timestamp.tzinfo is None else timestamp
    if start is None:
        return timestamp
    offset = timestamp.astimezone(UTC) - UNIX_EPOCH
    if timedelta(0) <= offset < RELATIVE_TIME_LIMIT:
        return (start.astimezone(UTC) + offset).astimezone(start.tzinfo)
    return timestamp.astimezone(start.tzinfo)


def numeric_timestamp(value: object, *, milliseconds: bool = False) -> datetime | None:
    """Accept CSV decimal seconds as well as numeric Parquet values."""
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        seconds = float(value)
        if milliseconds:
            seconds /= 1000
        if not math.isfinite(seconds):
            return None
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (ValueError, OverflowError, OSError):
        return None
