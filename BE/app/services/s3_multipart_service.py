"""Private multipart transfers. Only server-generated keys are accepted here."""
from contextlib import contextmanager
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.core import config
from app.services.storage_service import StorageUnavailableError, get_s3_client

PART_SIZE = 16 * 1024**2


@contextmanager
def s3_errors() -> Any:
    try:
        yield
    except (BotoCoreError, ClientError) as exc:
        raise StorageUnavailableError('Không thể kết nối S3. Vui lòng thử lại.') from exc


def create_transfer(key: str, job_id: str) -> str:
    with s3_errors():
        return get_s3_client().create_multipart_upload(
            Bucket=config.S3_BUCKET_NAME, Key=key, ContentType='text/csv',
            Metadata={'upload-job': job_id},
        )['UploadId']


def part_url(item: dict, number: int) -> str:
    size = min(PART_SIZE, item['size'] - (number - 1) * PART_SIZE)
    with s3_errors():
        return get_s3_client().generate_presigned_url('upload_part', Params={
            'Bucket': config.S3_BUCKET_NAME, 'Key': item['key'],
            'UploadId': item['upload_id'], 'PartNumber': number, 'ContentLength': size,
        }, ExpiresIn=900, HttpMethod='PUT')


def _head(item: dict) -> dict | None:
    try:
        return get_s3_client().head_object(Bucket=config.S3_BUCKET_NAME, Key=item['key'])
    except ClientError as exc:
        if str(exc.response['Error']['Code']) in {'404', 'NoSuchKey', 'NotFound'}:
            return None
        raise


def complete_transfer(item: dict, parts: list[dict], job_id: str) -> None:
    with s3_errors():
        # Completing S3 may succeed even when the HTTP response is lost. A retry
        # verifies the immutable object rather than completing the upload twice.
        head = _head(item)
        if head is None:
            actual = []
            for page in get_s3_client().get_paginator('list_parts').paginate(
                Bucket=config.S3_BUCKET_NAME, Key=item['key'], UploadId=item['upload_id'],
            ):
                actual.extend(page.get('Parts', []))
            expected = (item['size'] + PART_SIZE - 1) // PART_SIZE
            if len(actual) != expected or len(parts) != expected:
                raise ValueError('Chưa tải đủ các phần của tệp lên S3.')
            for number, (received, requested) in enumerate(zip(actual, parts, strict=True), 1):
                size = min(PART_SIZE, item['size'] - (number - 1) * PART_SIZE)
                if (received['PartNumber'] != number or requested['PartNumber'] != number
                        or received['ETag'] != requested['ETag'] or received['Size'] != size):
                    raise ValueError('Các phần của tệp không khớp kích thước hoặc ETag.')
            get_s3_client().complete_multipart_upload(
                Bucket=config.S3_BUCKET_NAME, Key=item['key'], UploadId=item['upload_id'],
                MultipartUpload={'Parts': parts},
            )
            head = _head(item)
        if (head is None or head['ContentLength'] != item['size']
                or head.get('Metadata', {}).get('upload-job') != job_id):
            raise ValueError('Tệp trên S3 không khớp phiên tải lên.')


def abort_transfer(item: dict) -> None:
    with s3_errors():
        try:
            get_s3_client().abort_multipart_upload(
                Bucket=config.S3_BUCKET_NAME, Key=item['key'], UploadId=item['upload_id'],
            )
        except ClientError as exc:
            if str(exc.response['Error']['Code']) != 'NoSuchUpload':
                raise
