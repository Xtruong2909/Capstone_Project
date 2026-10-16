from pathlib import Path, PurePosixPath
from typing import BinaryIO
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR, MAX_DATASET_UPLOAD_BYTES
from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetVersion
from app.schemas.dataset import DatasetUploadMetadata

SUPPORTED_FORMATS = {".csv", ".json", ".xls", ".xlsx", ".parquet"}
UPLOAD_CHUNK_SIZE = 1024 * 1024


class UnsupportedDatasetFormatError(ValueError):
    """Raised when an uploaded file uses an unsupported file extension."""


class DatasetFileTooLargeError(ValueError):
    """Raised when an uploaded file exceeds the configured size limit."""


class EmptyDatasetFileError(ValueError):
    """Raised when an uploaded file contains no bytes."""


class DatasetConflictError(ValueError):
    """Raised when dataset metadata conflicts with an existing dataset."""


def _safe_original_filename(filename: str) -> str:
    safe_name = PurePosixPath(filename.replace("\\", "/")).name
    if not safe_name or safe_name in {".", ".."}:
        raise UnsupportedDatasetFormatError("Tên file không hợp lệ")
    if len(safe_name) > 255:
        raise UnsupportedDatasetFormatError("Tên file không được dài quá 255 ký tự")
    return safe_name


def create_dataset_upload(
    db: Session,
    *,
    metadata: DatasetUploadMetadata,
    file_stream: BinaryIO,
    filename: str,
    creator_id: UUID,
    ip_address: str | None,
) -> tuple[Dataset, DatasetVersion]:
    """Store an uploaded dataset and persist its metadata as a pending version."""
    original_filename = _safe_original_filename(filename)
    extension = Path(original_filename).suffix.lower()
    if extension not in SUPPORTED_FORMATS:
        raise UnsupportedDatasetFormatError(
            "Định dạng không được hỗ trợ. Chấp nhận CSV, JSON, XLS, XLSX và Parquet."
        )

    dataset_id = uuid4()
    version_id = uuid4()
    stored_filename = f"{version_id}{extension}"
    absolute_path = DATASET_UPLOAD_DIR / str(dataset_id) / stored_filename
    relative_path = absolute_path.relative_to(DATASET_UPLOAD_DIR).as_posix()
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    file_size_bytes = 0
    try:
        with absolute_path.open("xb") as destination:
            while chunk := file_stream.read(UPLOAD_CHUNK_SIZE):
                file_size_bytes += len(chunk)
                if file_size_bytes > MAX_DATASET_UPLOAD_BYTES:
                    raise DatasetFileTooLargeError(
                        f"Kích thước file vượt quá giới hạn "
                        f"{MAX_DATASET_UPLOAD_BYTES} bytes"
                    )
                destination.write(chunk)

        if file_size_bytes == 0:
            raise EmptyDatasetFileError("File dataset không được để trống")

        try:
            return crud_dataset.create_dataset_version(
                db,
                metadata=metadata,
                dataset_id=dataset_id,
                version_id=version_id,
                creator_id=creator_id,
                dataset_code=f"DATASET_{dataset_id.hex.upper()}",
                version_tag="v1.0",
                data_file_path=relative_path,
                original_filename=original_filename,
                file_format=extension[1:].upper(),
                file_size_bytes=file_size_bytes,
                ip_address=ip_address,
            )
        except IntegrityError as exc:
            db.rollback()
            raise DatasetConflictError(
                "Mã dataset, tên dataset hoặc version đã tồn tại"
            ) from exc
    except Exception:
        absolute_path.unlink(missing_ok=True)
        raise
