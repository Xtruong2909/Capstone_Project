"""Repair local fixture file references from verified original CSVs; never write S3."""

import csv
import hashlib
import json
import sys
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import DATASET_UPLOAD_DIR, STORAGE_BACKEND
from app.crud import crud_dataset
from app.database.database import SessionLocal
from app.models.dataset import DatasetFile
from app.services.dataset_normalization_service import PNEUMA_HEADERS, _parse_number
from app.services.normalization_batch import write_pneuma_parquet


def restore() -> None:
    if STORAGE_BACKEND != "local":
        raise RuntimeError("This repair is for local storage only")
    root = DATASET_UPLOAD_DIR.resolve()
    source = root / "local-source"
    recovery = root / "local-recovery"
    recovery.mkdir(exist_ok=True)
    with SessionLocal() as db:
        candidates = db.query(DatasetFile).filter(DatasetFile.approval_status == "APPROVED").all()
        files = []
        snapshot = []
        for file in candidates:
            sessions = crud_dataset.list_all_file_sessions(db, file.id)
            if not sessions or any(not (source / s.original_filename).is_file() for s in sessions):
                print(f"SKIP {file.dataset_id}: original CSVs unavailable", flush=True)
                continue
            for session in sessions:
                path = source / session.original_filename
                if path.parent != source or not path.is_file():
                    raise RuntimeError(f"Original CSV unavailable: {session.original_filename}")
                with path.open("rb") as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                if session.checksum and session.checksum != digest:
                    raise RuntimeError(f"Checksum mismatch: {session.original_filename}")
            files.append(file)
            snapshot.append({"file_id": str(file.id), "data_file_path": file.data_file_path,
                "parquet_file_path": file.parquet_file_path, "csv_file_path": file.csv_file_path,
                "sessions": [{"id": str(s.id), "file_path": s.file_path} for s in sessions]})
        backup = recovery / f"references-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.json"
        backup.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        print(f"Verified originals; backed up references for {len(files)} datasets", flush=True)
        for file in files:
            sessions = crud_dataset.list_all_file_sessions(db, file.id)
            if not sessions:
                raise RuntimeError(f"No raw sessions linked to {file.id}")
            history = crud_dataset.get_cleaning_history_by_file(db, file.id)
            parameters = dict(history.parameters or {}) if history else {}
            # Preserve the export's exact session order for row-range previews.
            order = parameters.get("source_session_ids", [])
            sessions.sort(key=lambda s: (order.index(str(s.id)) if str(s.id) in order else len(order),
                                         s.scheduled_start, str(s.id)))
            session_counts = {}

            def rows(session_rows: list = sessions, counts: dict = session_counts) -> Iterator[list[str]]:
                for session in session_rows:
                    count = 0
                    with (source / session.original_filename).open(encoding="utf-8-sig", errors="replace", newline="") as stream:
                        reader = csv.reader(stream, delimiter=";")
                        next(reader, None)
                        for row in reader:
                            if row and any(row) and not (len(row) == len(PNEUMA_HEADERS)
                                    and tuple(v.strip().lower() for v in row) == PNEUMA_HEADERS):
                                end = len(row)
                                while end and not row[end - 1].strip():
                                    end -= 1
                                count += max(0, (end - 4) // 6)
                            yield row
                    counts[str(session.id)] = count

            path = recovery / f"{file.id}.parquet"
            _, after = write_pneuma_parquet(rows(), path, parameters.get("applied_mappings", {}), _parse_number)
            if after != file.total_records:
                raise RuntimeError(f"Restored row count differs for {file.id}: {after} != {file.total_records}")
            file.data_file_path = file.parquet_file_path = path.relative_to(root).as_posix()
            file.csv_file_path = None
            file.file_size_bytes = path.stat().st_size
            for session in sessions:
                session.file_path = f"local-source/{session.original_filename}"
            if history:
                history.parameters = {**parameters, "source_session_ids": [str(s.id) for s in sessions],
                                      "source_session_row_counts": session_counts}
            db.commit()
            print(f"RESTORED {file.dataset_id}: {len(sessions)} sessions, {after} rows", flush=True)


if __name__ == "__main__":
    restore()
