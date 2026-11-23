"""Bounded schema samples for immutable CSV recording objects on S3."""
import csv
import io
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import DATASET_UPLOAD_DIR
from app.services.dataset_preview_service import DatasetPreviewReadError, _csv_dialect, _read_csv
from app.services.storage_service import read_dataset_prefix

SCHEMA_SAMPLE_BYTES = 1024**2


def read_remote_recording_columns(stored_path: str) -> list[dict[str, str]]:
    data, complete = read_dataset_prefix(stored_path, upload_root=DATASET_UPLOAD_DIR, limit=SCHEMA_SAMPLE_BYTES)
    if not complete:
        # Discard the unfinished physical line and any incomplete quoted CSV record.
        end = max(data.rfind(b'\n'), data.rfind(b'\r'))
        if end < 0:
            raise DatasetPreviewReadError('Header CSV vượt quá giới hạn đọc cấu trúc cột.')
        data = data[:end + 1]
    text = data.decode('utf-8-sig')
    dialect = _csv_dialect(text.splitlines()[0] if text else '')
    reader = csv.reader(io.StringIO(text, newline=''), dialect, strict=True)
    rows: list[list[str]] = []
    try:
        for _ in range(6):
            row = next(reader, None)
            if row is None:
                break
            rows.append(row)
    except csv.Error:
        if complete or not rows:
            raise DatasetPreviewReadError('Cấu trúc CSV không hợp lệ.') from None
    if not rows:
        raise DatasetPreviewReadError('CSV không có hàng tiêu đề.')
    with TemporaryDirectory(prefix='dataset-schema-') as temporary:
        path = Path(temporary) / 'sample.csv'
        with path.open('w', encoding='utf-8', newline='') as target:
            csv.writer(target, dialect).writerows(rows)
        preview = _read_csv(path, offset=0, page_size=1, representation='raw', build_index=False)
    return [{'name': column.name, 'type': column.type} for column in preview.columns]
