"""Delete owned draft or fully rejected batches after checking active work."""
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR
from app.crud import crud_dataset
from app.crud import crud_dataset_batch as crud
from app.models.user import User
from app.schemas.dataset_batch import BatchDeleteResponse
from app.services.audit_log_service import record_audit_event
from app.services.storage_service import StorageUnavailableError, delete_dataset_file

logger = logging.getLogger(__name__)


def delete_batch(db: Session, group_id: UUID, user: User) -> BatchDeleteResponse:
    try:
        group = crud_dataset.get_dataset_group_by_id(db, group_id, for_update=True)
        if group is None:
            raise HTTPException(404, 'Không tìm thấy batch.')
        datasets = crud.lock_group_datasets(db, group_id)
        if not datasets or any(dataset.created_by != user.id for dataset in datasets):
            raise HTTPException(404, 'Không tìm thấy batch thuộc tài khoản của bạn.')
        dataset_ids = [dataset.id for dataset in datasets]
        files = crud.lock_group_files(db, dataset_ids)
        fully_rejected = len(files) == len(datasets) and all(
            file.approval_status == 'REJECTED' for file in files
        )
        submitted_before = group.first_submitted_at is not None or any(
            file.approval_status != 'PENDING' or file.submitted_at is not None
            or file.submitted_by is not None or file.approved_by is not None for file in files
        )
        if submitted_before and not fully_rejected:
            raise HTTPException(409, 'Chỉ có thể xóa batch chưa gửi phê duyệt hoặc đã bị từ chối toàn bộ.')
        jobs = crud.group_processing_jobs(db, group_id)
        if any(job.status in {'PENDING', 'RUNNING', 'QUEUED', 'PROCESSING'} for job in jobs) or crud.has_active_upload(db, user.id):
            raise HTTPException(409, 'Đang tải lên hoặc xử lý dữ liệu. Hãy đợi hoàn tất trước khi xóa batch.')
        sessions = crud.group_sessions(db, dataset_ids)
        paths = {session.file_path for session in sessions if session.file_path}
        for file in files:
            paths.update(path for path in (file.data_file_path, file.csv_file_path, file.parquet_file_path) if path)
        for job in jobs:
            for result in job.results or []:
                if result.get('staging_id'):
                    staging_id = UUID(str(result['staging_id']))
                    paths.update({f'staging/{staging_id}.json', f'staging/{staging_id}.parquet'})
        name = group.name or group.drone_id
        session_count, dataset_count = len(sessions), len(datasets)
        crud.delete_group_rows(db, group_id, dataset_ids, user.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Batch đang được tham chiếu bởi kết quả phân tích; chưa thể xóa.') from exc
    except Exception:
        db.rollback()
        raise
    # Physical files are only removed after the metadata transaction succeeds.
    # Preserve any paths still referenced by another dataset/session.
    pending = []
    try:
        used = crud.referenced_paths(db, list(paths))
    except SQLAlchemyError:
        db.rollback()
        logger.exception('Batch deleted but storage reference check failed for group %s', group_id)
        used = paths
        pending.extend(sorted(paths))
    for path in sorted(paths - used):
        try:
            delete_dataset_file(path, upload_root=DATASET_UPLOAD_DIR)
        except (StorageUnavailableError, OSError, ValueError):
            logger.warning('Batch storage cleanup deferred for group %s', group_id)
            pending.append(path)
    record_audit_event(user=user, action='DELETE_DATASET_GROUP', module='Dataset', status='SUCCESS',
        description='Rejected dataset batch deleted' if fully_rejected else 'Unsubmitted dataset batch deleted', resource_id=group_id,
        details={'group_name': name, 'deleted_datasets': dataset_count, 'deleted_sessions': session_count,
                 'pending_storage_cleanup': pending})
    return BatchDeleteResponse(group_id=group_id, deleted_datasets=dataset_count,
        deleted_sessions=session_count, cleanup_pending=bool(pending),
        message='Đã xóa batch. Một số tệp cần dọn lại.' if pending else 'Đã xóa batch thành công.')
