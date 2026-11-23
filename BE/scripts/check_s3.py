"""Read-only S3 connection probe, or explicit synthetic file roundtrip.

Run: uv run python -m scripts.check_s3 [--roundtrip]
The roundtrip uploads only tiny synthetic files under a unique check prefix and
deletes those objects afterwards. It never reads/writes application DB rows.
"""

import argparse
import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import pyarrow.parquet as pq

from app.core import config
from app.services.dataset_normalization_service import _parse_number
from app.services.dataset_preview_service import _read_preview_rows
from app.services.normalization_batch import FIELDS, write_pneuma_parquet
from app.services.storage_service import (
    delete_dataset_file,
    get_s3_client,
    persist_dataset_file,
    resolve_dataset_file,
)


def check_connection(*, roundtrip: bool = False) -> dict:
    if not config.S3_BUCKET_NAME:
        raise RuntimeError("Configure S3_BUCKET_NAME before running this check")
    get_s3_client().head_bucket(Bucket=config.S3_BUCKET_NAME)
    result = {"connected": True, "bucket": config.S3_BUCKET_NAME, "region": config.S3_REGION}
    if not roundtrip:
        return result
    if config.STORAGE_BACKEND != "s3":
        raise RuntimeError("Set STORAGE_BACKEND=s3 for the explicit roundtrip check")
    references: list[str] = []
    try:
        with TemporaryDirectory(prefix="capstone-s3-check-") as temporary:
            root = Path(temporary)
            folder = root / ".checks" / uuid4().hex
            folder.mkdir(parents=True)
            source = folder / "20181024_d1_0830_0900.csv"
            source.write_text(";".join(FIELDS) +
                "\n1;car;100;10;37;23;12;0;0;0;38;24;13;0;0;60\n", encoding="utf-8")
            raw = persist_dataset_file(source, upload_root=root)
            references.append(raw)
            source.unlink()
            downloaded = resolve_dataset_file(raw, upload_root=root)
            data = _read_preview_rows(downloaded, "CSV", offset=0, page_size=10,
                representation="normalized")
            with downloaded.open(encoding="utf-8", newline="") as stream:
                reader = csv.reader(stream, delimiter=";")
                next(reader)
                normalized = folder / "normalized.parquet"
                before, after = write_pneuma_parquet(reader, normalized, {}, _parse_number)
            exported = persist_dataset_file(normalized, upload_root=root)
            references.append(exported)
            normalized.unlink()
            cached = resolve_dataset_file(exported, upload_root=root)
            cached.unlink()
            # Fetch again with no cached export, as on a fresh backend instance.
            recovered = resolve_dataset_file(exported, upload_root=root)
            rows = pq.read_table(recovered).to_pylist()
            if (before, after) != (1, 2) or len(rows) != 2 or rows[1]["time"] != 60.0:
                raise AssertionError("S3 normalization roundtrip did not preserve samples")
            result.update({"raw_preview_rows": len(data.rows), "normalized_rows": len(rows),
                "cache_recovery": True, "roundtrip": "passed"})
    finally:
        # Only this run's generated UUID keys, never a broad bucket/prefix delete.
        for reference in references:
            delete_dataset_file(reference, upload_root=Path(temporary))
    result["test_objects_deleted"] = len(references)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roundtrip", action="store_true")
    args = parser.parse_args()
    print(json.dumps(check_connection(roundtrip=args.roundtrip), ensure_ascii=True))


if __name__ == "__main__":
    main()
