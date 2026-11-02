"""Fast all-valid screening; suspect blocks retain the detailed scalar validator."""

from typing import Any

import pyarrow as pa
import pyarrow.compute as pc

from app.schemas.data_quality import DataQualityOutlierRule

POINT_FIELDS = ("lat", "lon", "speed", "lon_acc", "lat_acc", "time")


def clean_point_block(
    values: list[Any], start: int, stop: int, rules: dict[str, DataQualityOutlierRule],
) -> bool:
    """Return True only when every field passes all existing point checks."""
    if stop <= start or (stop - start) % 6:
        return False
    try:
        for offset, field in enumerate(POINT_FIELDS):
            # This path handles csv.reader strings only. Explicit typing avoids
            # repeated type inference / optional pandas probing for every column.
            column = pa.array(
                values[start + offset:stop:6], type=pa.string(), from_pandas=False,
            )
            column = pc.utf8_trim_whitespace(column)
            numbers = pc.cast(column, pa.float64())
            if numbers.null_count or not pc.all(pc.is_finite(numbers)).as_py():
                return False
            bounds = pc.min_max(numbers).as_py()
            lower, upper = bounds["min"], bounds["max"]
            if lower is None or upper is None:
                return False
            if field in {"speed", "time"} and lower < 0:
                return False
            if field in {"lat", "lon"}:
                limit = 90 if field == "lat" else 180
                if lower < -limit or upper > limit:
                    return False
            rule = rules.get(field)
            if rule is not None and (
                (rule.min_value is not None and lower < rule.min_value)
                or (rule.max_value is not None and upper > rule.max_value)
            ):
                return False
    except (pa.ArrowInvalid, pa.ArrowNotImplementedError, pa.ArrowTypeError, TypeError):
        # Includes malformed/missing numeric strings: the scalar path supplies errors.
        return False
    return True
