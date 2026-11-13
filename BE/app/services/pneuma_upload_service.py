"""Streaming, partially successful pNEUMA recording uploads."""

import hashlib
import logging
import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import BinaryIO
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import (
    DATASET_UPLOAD_DIR,
    MAX_DATASET_UPLOAD_BATCH_BYTES,
    MAX_DATASET_UPLOAD_BYTES,
)
from app.crud import crud_dataset
from app.database.database import SessionLocal
from app.models.dataset import Dataset, DatasetVersion, RecordingSession
from app.schemas.dataset import (
    DatasetBatchUploadResponse,
    DatasetUploadGroup,
    DatasetUploadJobResponse,
    RecordingUploadResult,
    UploadedRecordingSession,
)
from app.services.audit_log_service import record_audit_event
from app.services.dataset_multipart_service import StreamedUploadFile

FILENAME_PATTERN = re.compile(
    r"^(?P<day>\d{8})_(?P<drone>d\d+)_(?P<start>\d{4})_(?P<end>\d{4})\.csv$",
    re.IGNORECASE,
)
CHUNK_SIZE = 1024 * 1024
ATHENS_TIMEZONE = ZoneInfo("Europe/Athens")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RecordingMetadata:
    dataset_name: str
    recording_date: date
    drone_id: str
    scheduled_start: datetime
    scheduled_end: datetime


@dataclass
class StagedRecording:
    metadata: RecordingMetadata
    filename: str
    path: Path
    size: int
    checksum: str
    result: RecordingUploadResult


@dataclass
class PreparedBatch:
    total_files: int
    results: list[RecordingUploadResult]
    groups: dict[str, list[StagedRecording]]
    staged_files: list[StagedRecording]
    source: str | None = None
    location_name: str | None = None
    description: str | None = None
    group_name: str | None = None

    def cleanup(self) -> None:
        for item in self.staged_files:
            item.path.unlink(missing_ok=True)


def parse_recording_filename(filename: str) -> RecordingMetadata:
    if not filename or len(filename) > 255 or "/" in filename or "\\" in filename:
        raise ValueError("Tên file không an toàn hoặc không hợp lệ")
    match = FILENAME_PATTERN.fullmatch(filename)
    if match is None:
        raise ValueError("Tên file phải theo mẫu YYYYMMDD_dX_HHMM_HHMM.csv")
    try:
        recording_date = date(int(match["day"][:4]), int(match["day"][4:6]),
                              int(match["day"][6:]))
        start_hour, start_minute = int(match["start"][:2]), int(match["start"][2:])
        end_hour, end_minute = int(match["end"][:2]), int(match["end"][2:])
        start = datetime.combine(recording_date, datetime.min.time(), ATHENS_TIMEZONE).replace(
            hour=start_hour, minute=start_minute,
        )
        end = datetime.combine(recording_date, datetime.min.time(), ATHENS_TIMEZONE).replace(
            hour=end_hour, minute=end_minute,
        )
    except ValueError as exc:
        raise ValueError("Ngày hoặc giờ ghi hình trong tên file không hợp lệ") from exc
    if end <= start:
        raise ValueError("Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày")
    drone_id = match["drone"].lower()
    return RecordingMetadata(
        dataset_name=f"{match['day']}-{drone_id}",
        recording_date=recording_date,
        drone_id=drone_id,
        scheduled_start=start,
        scheduled_end=end,
    )


def stage_recording(stream: BinaryIO, metadata: RecordingMetadata, filename: str) -> StagedRecording:
    if isinstance(stream, StreamedUploadFile):
        path, size, checksum = stream.claim()
        return StagedRecording(
            metadata=metadata, filename=filename, path=path, size=size,
            checksum=checksum,
            result=RecordingUploadResult(
                original_filename=filename,
                dataset_name=metadata.dataset_name,
                status="ERROR",
            ),
        )
    staging_dir = DATASET_UPLOAD_DIR / ".staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0
    path: Path | None = None
    try:
        with NamedTemporaryFile(mode="wb", prefix="upload-", suffix=".csv",
                                dir=staging_dir, delete=False) as target:
            path = Path(target.name)
            while chunk := stream.read(CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_DATASET_UPLOAD_BYTES:
                    raise ValueError(f"File vượt quá {MAX_DATASET_UPLOAD_BYTES} byte")
                if b"\x00" in chunk:
                    raise ValueError("Nội dung không phải CSV văn bản")
                digest.update(chunk)
                target.write(chunk)
        if size == 0:
            raise ValueError("File CSV trống")
        return StagedRecording(
            metadata=metadata, filename=filename, path=path, size=size,
            checksum=digest.hexdigest(),
            result=RecordingUploadResult(original_filename=filename,
                                         dataset_name=metadata.dataset_name, status="ERROR"),
        )
    except Exception:
        if path is not None:
            path.unlink(missing_ok=True)
        raise


def _persist_group(
    db: Session, name: str, staged: list[StagedRecording], creator_id: UUID,
    ip_address: str | None, source: str | None,
    location_name: str | None, description: str | None,
    group_name: str | None,
) -> DatasetUploadGroup:
    moved: list[Path] = []
    pending: list[tuple[StagedRecording, RecordingSession]] = []
    try:
        crud_dataset.lock_dataset_upload(db, name)
        dataset = crud_dataset.get_dataset_by_name(db, name)
        metadata = staged[0].metadata
        if dataset is not None and (
            (dataset.drone_id is None and dataset.source.lower() != "pneuma")
            or (dataset.recording_date or dataset.capture_date) != metadata.recording_date
            or dataset.drone_id not in (None, metadata.drone_id)
        ):
            raise ValueError("Ngày ghi hình hoặc drone trong tên file không khớp Dataset hiện có")
        if dataset is not None:
            dataset.recording_date = metadata.recording_date
            dataset.drone_id = metadata.drone_id
        group = crud_dataset.get_or_create_dataset_group(
            db, dataset.source if dataset is not None else (source or "pNEUMA"),
            metadata.drone_id,
        )
        if group_name is not None:
            group.name = group_name
        if dataset is None:
            dataset_id = uuid4()
            dataset = Dataset(
                id=dataset_id, name=name, code=f"DATASET_{dataset_id.hex.upper()}",
                source=source or "pNEUMA", location_name=location_name or "Athens, Greece",
                description=description,
                capture_date=metadata.recording_date,
                recording_date=metadata.recording_date, drone_id=metadata.drone_id,
                group_id=group.id,
                created_by=creator_id,
            )
            db.add(dataset)
            db.flush()
        else:
            dataset.group_id = group.id
        existing = crud_dataset.get_recording_sessions(db, dataset.id)
        by_name = {item.original_filename: item for item in existing}
        by_checksum = {item.checksum: item for item in existing}
        for item in staged:
            named = by_name.get(item.filename)
            checked = by_checksum.get(item.checksum)
            if named is not None and named.checksum != item.checksum:
                item.result.status = "CONFLICT"
                item.result.error_message = "Tên file đã tồn tại với nội dung khác"
                continue
            if named is not None or checked is not None:
                item.result.status = "DUPLICATE"
                item.result.session_id = (named or checked).id
                continue
            session_id = uuid4()
            relative_path = f"{name}/{session_id}.csv"
            session = RecordingSession(
                id=session_id, dataset_id=dataset.id, original_filename=item.filename,
                drone_id=item.metadata.drone_id,
                recording_date=item.metadata.recording_date,
                scheduled_start=item.metadata.scheduled_start,
                scheduled_end=item.metadata.scheduled_end,
                file_path=relative_path, file_size=item.size,
                checksum=item.checksum, upload_status="UPLOADED",
            )
            by_name[item.filename] = session
            by_checksum[item.checksum] = session
            pending.append((item, session))
        # Optional form hints matter only when adding new sessions. A retry of
        # existing files must remain DUPLICATE even if Swagger sent placeholders.
        if dataset is not None and pending:
            conflicts = []
            if source is not None and dataset.source.casefold() != source.casefold():
                conflicts.append("source")
            if location_name is not None and dataset.location_name != location_name:
                conflicts.append("location_name")
            if description is not None and dataset.description != description:
                conflicts.append("description")
            if conflicts:
                raise ValueError(
                    "Metadata không khớp Dataset hiện có: " + ", ".join(conflicts)
                    + ". Để trống các trường tùy chọn khi upload thêm Session."
                )
        version_id = None
        if pending:
            version_number, version_tag = crud_dataset.get_next_upload_version(db, dataset.id)
            version_id = uuid4()
            first = pending[0][1]
            session_count = len(existing) + len(pending)
            single_file_path = first.file_path if session_count == 1 else None
            version = DatasetVersion(
                id=version_id, dataset_id=dataset.id, version_tag=version_tag,
                version_number=version_number, data_file_path=single_file_path,
                csv_file_path=single_file_path,
                original_filename=first.original_filename if session_count == 1 else None,
                file_format="CSV", file_size_bytes=(
                    sum(session.file_size for session in existing)
                    + sum(session.file_size for _, session in pending)
                ),
                approval_status="PENDING",
            )
            db.add(version)
            for item, session in pending:
                destination = DATASET_UPLOAD_DIR / session.file_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                os.replace(item.path, destination)
                moved.append(destination)
                crud_dataset.add_recording_session(db, session)
            db.flush()
            crud_dataset.link_version_sessions(
                db, version_id, [session.id for session in existing]
                + [session.id for _, session in pending],
            )
        else:
            latest = crud_dataset.get_dataset_latest_version(db, dataset.id)
            version_id = latest[1].id if latest else None
        db.commit()
        for item, session in pending:
            item.result.status = "UPLOADED"
            item.result.session_id = session.id
        if pending:
            record_audit_event(
                action="UPLOAD_DATASET", module="Dataset", status="SUCCESS",
                description="pNEUMA recording sessions uploaded", user_id=creator_id,
                resource_id=version_id, ip_address=ip_address,
                details={"dataset_name": name, "file_count": len(pending)},
            )
        all_sessions = sorted(
            [*existing, *(session for _, session in pending)],
            key=lambda session: (session.scheduled_start, session.id),
        )
        pending_ids = {session.id for _, session in pending}
        session_count = len(all_sessions)
        return DatasetUploadGroup(
            name=name, dataset_id=dataset.id, version_id=version_id,
            group_id=group.id, group_name=group.name,
            recording_date=metadata.recording_date, drone_id=metadata.drone_id,
            session_count=session_count,
            sessions=[UploadedRecordingSession(
                session_id=session.id,
                original_filename=session.original_filename,
                scheduled_start=session.scheduled_start.astimezone(ATHENS_TIMEZONE),
                scheduled_end=session.scheduled_end.astimezone(ATHENS_TIMEZONE),
                status="UPLOADED" if session.id in pending_ids else "EXISTING",
            ) for session in all_sessions],
        )
    except Exception:
        db.rollback()
        for path in moved:
            path.unlink(missing_ok=True)
        raise


def prepare_pneuma_batch(
    files: list[tuple[str, BinaryIO]], name: str | None = None,
    source: str | None = None, location_name: str | None = None,
    capture_date: date | None = None, description: str | None = None,
    group_name: str | None = None,
) -> PreparedBatch:
    """Validate, hash, and stage files using bounded memory."""
    # A batch may contain several dates or drones. In that case each filename
    # defines its own Dataset; the legacy single-Dataset hints cannot apply.
    parsed_metadata: list[RecordingMetadata | None] = []
    for filename, _stream in files:
        try:
            parsed_metadata.append(parse_recording_filename(filename))
        except ValueError:
            parsed_metadata.append(None)
    multiple_datasets = len({
        metadata.dataset_name for metadata in parsed_metadata if metadata is not None
    }) > 1
    if group_name is not None and len({
        metadata.drone_id for metadata in parsed_metadata if metadata is not None
    }) > 1:
        raise ValueError("group_name chỉ áp dụng khi các file thuộc cùng một drone")
    results: list[RecordingUploadResult] = []
    groups: dict[str, list[StagedRecording]] = {}
    staged_files: list[StagedRecording] = []
    total_bytes = 0
    try:
        for (filename, stream), parsed in zip(files, parsed_metadata, strict=True):
            try:
                metadata = parsed or parse_recording_filename(filename)
                if not multiple_datasets and (
                    (name is not None and name != metadata.dataset_name)
                    or (capture_date is not None and capture_date != metadata.recording_date)
                ):
                    raise ValueError("Metadata cung cấp mâu thuẫn với tên file pNEUMA")
                item = stage_recording(stream, metadata, filename)
                total_bytes += item.size
                if total_bytes > MAX_DATASET_UPLOAD_BATCH_BYTES:
                    item.path.unlink(missing_ok=True)
                    raise ValueError(f"Batch vượt quá {MAX_DATASET_UPLOAD_BATCH_BYTES} byte")
                staged_files.append(item)
                groups.setdefault(metadata.dataset_name, []).append(item)
                results.append(item.result)
            except (ValueError, OSError) as exc:
                results.append(RecordingUploadResult(
                    original_filename=filename, status="ERROR", error_message=str(exc),
                ))
        return PreparedBatch(len(files), results, groups, staged_files,
                             source, location_name, description, group_name)
    except Exception:
        for item in staged_files:
            item.path.unlink(missing_ok=True)
        raise


def finish_pneuma_batch(
    db: Session, prepared: PreparedBatch, creator_id: UUID,
    ip_address: str | None = None,
    progress: Callable[[int], None] | None = None,
) -> DatasetBatchUploadResponse:
    """Commit each dataset independently and clean staging files."""
    results, groups = prepared.results, prepared.groups
    processed = prepared.total_files - sum(len(items) for items in groups.values())
    try:
        summaries = []
        for dataset_name, items in groups.items():
            try:
                summaries.append(_persist_group(
                    db, dataset_name, items, creator_id, ip_address,
                    prepared.source, prepared.location_name, prepared.description,
                    prepared.group_name,
                ))
            except Exception as exc:
                if not isinstance(exc, ValueError):
                    logger.exception("Failed to persist pNEUMA dataset %s", dataset_name)
                for item in items:
                    item.result.status = "ERROR"
                    item.result.session_id = None
                    item.result.error_message = (
                        str(exc) if isinstance(exc, ValueError)
                        else "Không thể lưu Dataset; vui lòng thử lại"
                    )
            processed += len(items)
            if progress is not None:
                progress(processed)
        return DatasetBatchUploadResponse(
            group_id=_common_group_id(summaries),
            group_name=_common_group_name(summaries),
            total_files=prepared.total_files,
            uploaded_count=sum(item.status == "UPLOADED" for item in results),
            duplicate_count=sum(item.status == "DUPLICATE" for item in results),
            failed_count=sum(item.status in ("ERROR", "CONFLICT") for item in results),
            datasets=summaries, files=results,
        )
    finally:
        prepared.cleanup()


def _common_group_id(groups: list[DatasetUploadGroup]) -> UUID | None:
    """Only expose one top-level ID when every successful Dataset shares it."""
    if not groups or any(group.group_id is None for group in groups):
        return None
    ids = {group.group_id for group in groups}
    return next(iter(ids)) if len(ids) == 1 else None


def _common_group_name(groups: list[DatasetUploadGroup]) -> str | None:
    return groups[0].group_name if _common_group_id(groups) is not None else None


def upload_pneuma_batch(
    db: Session, files: list[tuple[str, BinaryIO]], creator_id: UUID,
    ip_address: str | None = None, name: str | None = None,
    source: str | None = None, location_name: str | None = None,
    capture_date: date | None = None, description: str | None = None,
    group_name: str | None = None,
) -> DatasetBatchUploadResponse:
    """Synchronous path for small batches."""
    prepared = prepare_pneuma_batch(files, name, source, location_name, capture_date,
                                    description, group_name)
    return finish_pneuma_batch(db, prepared, creator_id, ip_address)


def run_pneuma_upload_job(
    job_id: UUID, prepared: PreparedBatch, creator_id: UUID, ip_address: str | None,
) -> None:
    """Background worker; uses a fresh database session after the request has ended."""
    db = SessionLocal()
    try:
        job = crud_dataset.get_upload_job(db, job_id)
        job.status = "RUNNING"
        job.processed_files = prepared.total_files - sum(len(group) for group in prepared.groups.values())
        crud_dataset.save_upload_job(db, job)

        def update_progress(count: int) -> None:
            job.processed_files = count
            crud_dataset.save_upload_job(db, job)

        result = finish_pneuma_batch(db, prepared, creator_id, ip_address, update_progress)
        job.status = "FAILED" if result.failed_count == result.total_files else "COMPLETED"
        job.result = result.model_dump(mode="json")
        job.processed_files = prepared.total_files
        if job.status == "FAILED":
            job.error_message = "Tất cả file đều lỗi; xem result.files để biết chi tiết"
        crud_dataset.save_upload_job(db, job)
    except Exception:
        logger.exception("pNEUMA upload job %s failed", job_id)
        db.rollback()
        prepared.cleanup()
        job = crud_dataset.get_upload_job(db, job_id)
        if job is not None:
            job.status = "FAILED"
            job.error_message = "Upload thất bại; vui lòng thử lại"
            crud_dataset.save_upload_job(db, job)
    finally:
        db.close()


def get_pneuma_upload_job_response(
    db: Session, job_id: UUID, user_id: UUID,
) -> DatasetUploadJobResponse:
    """Show the persisted group IDs even for jobs saved before grouping existed."""
    job = crud_dataset.get_upload_job(db, job_id)
    if job is None or job.created_by != user_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy upload job")
    result = DatasetBatchUploadResponse.model_validate(job.result) if job.result else None
    if result is not None:
        missing_ids = [item.dataset_id for item in result.datasets
                       if item.dataset_id is not None and item.group_id is None]
        group_ids = crud_dataset.get_dataset_group_ids(db, missing_ids)
        for item in result.datasets:
            if item.group_id is None and item.dataset_id is not None:
                item.group_id = group_ids.get(item.dataset_id)
        result.group_id = _common_group_id(result.datasets)
        result.group_name = _common_group_name(result.datasets)
    return DatasetUploadJobResponse(
        group_id=result.group_id if result is not None else None,
        group_name=result.group_name if result is not None else None,
        job_id=job.id, status=job.status, total_files=job.total_files,
        processed_files=job.processed_files, result=result,
        error_message=job.error_message,
    )
