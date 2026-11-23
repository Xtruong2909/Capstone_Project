"""Private dataset storage, with bounded disk staging for existing CSV/Parquet readers.

New object keys contain application-generated UUID filenames and are immutable.
DB rows store durable s3:// references, never expiring presigned URLs. Existing
local references remain readable after enabling S3; no implicit data migration.
"""

import hashlib
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path, PurePosixPath
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Any
from urllib.parse import urlsplit

import boto3
from boto3.exceptions import Boto3Error
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core import config

logger = logging.getLogger(__name__)
_CACHE_LOCKS = [Lock() for _ in range(64)]
_TRANSFER = TransferConfig(
    multipart_threshold=64 * 1024**2, multipart_chunksize=16 * 1024**2,
    max_concurrency=2, io_chunksize=1024**2,
)


class StorageUnavailableError(Exception):
    """Storage cannot be reached/configured; do not expose SDK errors to clients."""


@lru_cache(maxsize=1)
def get_s3_client() -> Any:
    # Default SDK credentials: named profile locally, instance role on EC2.
    # Access keys are never passed through application code or returned by APIs.
    try:
        # Browser PUT preflights cannot follow S3's global-endpoint redirects.
        # Use the bucket region explicitly, including for newly created buckets.
        return boto3.client("s3", region_name=config.S3_REGION,
            endpoint_url=f"https://s3.{config.S3_REGION}.amazonaws.com", config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
            connect_timeout=10, read_timeout=60,
            retries={"max_attempts": 3, "mode": "standard"},
        ))
    except BotoCoreError as exc:
        raise StorageUnavailableError("Không thể khởi tạo kết nối S3.") from exc


def _canonical_path(path: Path) -> Path:
    resolved = path.resolve()
    value = str(resolved)
    # Windows may return extended-length paths while another thread creates a
    # parent. Compare both sides using the same canonical path representation.
    if os.name == "nt":
        if value.startswith("\\\\?\\UNC\\"):
            value = "\\\\" + value[8:]
        elif value.startswith("\\\\?\\"):
            value = value[4:]
    return Path(value)


def _local_path(stored_path: str, upload_root: Path) -> Path:
    root = _canonical_path(upload_root)
    candidate = Path(stored_path)
    if not candidate.is_absolute():
        candidate = root / candidate
    try:
        resolved = _canonical_path(candidate)
        resolved.relative_to(root)
    except (OSError, ValueError) as exc:
        raise FileNotFoundError("Đường dẫn file không hợp lệ.") from exc
    return resolved


def _object(stored_path: str) -> tuple[str, str]:
    uri = urlsplit(stored_path)
    key = uri.path.removeprefix("/")
    prefix = config.S3_KEY_PREFIX
    if (
        uri.scheme != "s3" or not config.S3_BUCKET_NAME
        or uri.netloc != config.S3_BUCKET_NAME or uri.query or uri.fragment
        or not key or "\\" in key or "\x00" in key
        or any(part in {".", "..", ""} for part in key.split("/"))
        or (prefix and not key.startswith(prefix + "/"))
    ):
        raise FileNotFoundError("Tham chiếu file S3 không hợp lệ.")
    return uri.netloc, key


def _cache_path(stored_path: str, upload_root: Path) -> Path:
    _, key = _object(stored_path)
    digest = hashlib.sha256(stored_path.encode()).hexdigest()
    suffix = PurePosixPath(key).suffix.lower()
    if suffix not in {".csv", ".json", ".xls", ".xlsx", ".parquet"}:
        suffix = ".data"
    # Resolve as a local path too, so a malicious cache symlink cannot escape.
    return _local_path(f".s3-cache/{digest}{suffix}", upload_root)


def _missing(exc: ClientError) -> bool:
    return str(exc.response.get("Error", {}).get("Code")) in {"404", "NoSuchKey", "NotFound"}


def persist_dataset_file(path: Path, *, upload_root: Path) -> str:
    """Persist a completed, validated file before its DB reference is committed.

    Keep the local staging file until the caller commits or rolls back the DB.
    """
    local = _local_path(str(_canonical_path(path)), upload_root)
    relative = local.relative_to(_canonical_path(upload_root)).as_posix()
    if not local.is_file():
        raise FileNotFoundError("Không tìm thấy file để lưu trữ.")
    if config.STORAGE_BACKEND == "local":
        return relative
    if not config.S3_BUCKET_NAME:
        raise StorageUnavailableError("Chưa cấu hình bucket S3.")
    key = "/".join(part for part in (config.S3_KEY_PREFIX, relative) if part)
    reference = f"s3://{config.S3_BUCKET_NAME}/{key}"
    _object(reference)
    try:
        get_s3_client().upload_file(str(local), config.S3_BUCKET_NAME, key, Config=_TRANSFER)
    except (Boto3Error, BotoCoreError, ClientError, OSError) as exc:
        cleanup_failed_file(reference, upload_root=upload_root)
        raise StorageUnavailableError("Không thể lưu file lên S3; hãy thử lại.") from exc
    return reference


def resolve_dataset_file(stored_path: str | None, *, upload_root: Path) -> Path:
    """Materialize an authorized DB reference; never accepts arbitrary web URLs."""
    if not stored_path:
        raise FileNotFoundError("Chưa có đường dẫn file dữ liệu.")
    if not stored_path.startswith("s3://"):
        local = _local_path(stored_path, upload_root)
        if not local.is_file():
            raise FileNotFoundError("Không tìm thấy file dữ liệu trong kho lưu trữ.")
        return local
    bucket, key = _object(stored_path)
    cache = _cache_path(stored_path, upload_root)
    lock = _CACHE_LOCKS[int(hashlib.sha256(stored_path.encode()).hexdigest()[:8], 16) % 64]
    with lock:
        if cache.is_file():
            return cache
        cache.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=cache.parent, suffix=".part", delete=False) as target:
            temporary = Path(target.name)
        try:
            get_s3_client().download_file(bucket, key, str(temporary), Config=_TRANSFER)
            temporary.replace(cache)
        except ClientError as exc:
            if _missing(exc):
                raise FileNotFoundError("Không tìm thấy file dữ liệu trên S3.") from exc
            raise StorageUnavailableError("Không thể đọc file từ S3.") from exc
        except (Boto3Error, BotoCoreError, OSError) as exc:
            raise StorageUnavailableError("Không thể tải file S3 về vùng xử lý.") from exc
        finally:
            temporary.unlink(missing_ok=True)
    return cache


def resolve_dataset_files(stored_paths: list[str], *, upload_root: Path) -> list[Path]:
    """Prepare source files with at most two concurrent, disk-backed S3 downloads.

    Preserve source order and existing cache locks/atomic writes. Only file I/O
    runs in worker threads; database sessions remain on the calling thread.
    """
    if len(stored_paths) < 2 or not any(path.startswith('s3://') for path in stored_paths):
        return [resolve_dataset_file(path, upload_root=upload_root) for path in stored_paths]
    for path in stored_paths:
        if path.startswith('s3://') and not _cache_path(path, upload_root).is_file():
            # Construct the shared SDK client before starting worker threads.
            get_s3_client()
            break
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix='normalize-source') as pool:
        futures = [pool.submit(resolve_dataset_file, path, upload_root=upload_root) for path in stored_paths]
        try:
            return [future.result() for future in futures]
        except Exception:
            for future in futures:
                future.cancel()
            raise


def dataset_file_exists(stored_path: str | None, *, upload_root: Path) -> bool:
    """Check durable storage, without downloading a large file for workflow status."""
    if not stored_path:
        return False
    if not stored_path.startswith("s3://"):
        try:
            return _local_path(stored_path, upload_root).is_file()
        except FileNotFoundError:
            return False
    bucket, key = _object(stored_path)
    try:
        get_s3_client().head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        if _missing(exc):
            return False
        raise StorageUnavailableError("Không thể kiểm tra file trên S3.") from exc
    except BotoCoreError as exc:
        raise StorageUnavailableError("Không thể kết nối S3.") from exc


def read_dataset_prefix(stored_path: str, *, upload_root: Path, limit: int) -> tuple[bytes, bool]:
    """Read a bounded prefix for schema discovery; never materialize the full object."""
    if not 0 < limit <= 1024**2:
        raise ValueError('Giới hạn đọc cấu trúc cột không hợp lệ.')
    if not stored_path.startswith('s3://'):
        with _local_path(stored_path, upload_root).open('rb') as source:
            data = source.read(limit + 1)
    else:
        bucket, key = _object(stored_path)
        try:
            response = get_s3_client().get_object(Bucket=bucket, Key=key, Range=f'bytes=0-{limit}')
            body = response['Body']
            try:
                data = body.read(limit + 1)
            finally:
                body.close()
        except ClientError as exc:
            if _missing(exc):
                raise FileNotFoundError('Không tìm thấy file dữ liệu trên S3.') from exc
            raise StorageUnavailableError('Không thể đọc cấu trúc cột từ S3.') from exc
        except BotoCoreError as exc:
            raise StorageUnavailableError('Không thể kết nối S3.') from exc
    return data[:limit], len(data) <= limit


def delete_dataset_file(stored_path: str, *, upload_root: Path) -> None:
    """Compensate a failed DB write; caller only supplies newly created references."""
    if not stored_path.startswith("s3://"):
        _local_path(stored_path, upload_root).unlink(missing_ok=True)
        return
    bucket, key = _object(stored_path)
    try:
        get_s3_client().delete_object(Bucket=bucket, Key=key)
        _cache_path(stored_path, upload_root).unlink(missing_ok=True)
    except (BotoCoreError, ClientError, OSError) as exc:
        raise StorageUnavailableError("Không thể dọn file S3 sau thao tác thất bại.") from exc


def cleanup_failed_file(stored_path: str | None, *, upload_root: Path) -> None:
    """Best effort rollback cleanup; retain the original DB/storage error."""
    if stored_path:
        try:
            delete_dataset_file(stored_path, upload_root=upload_root)
        except (StorageUnavailableError, OSError):
            logger.warning("Storage rollback cleanup failed; reconciliation needed")


def discard_local_file(path: Path) -> None:
    """Post-commit cleanup must never turn a successful upload into a failed API.

    Windows scanners/readers may briefly hold a file open. Keep the staging copy
    for later cleanup in that case; its durable S3 reference remains valid.
    """
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Local staging cleanup deferred; file is still in use")
