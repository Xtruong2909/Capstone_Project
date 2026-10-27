from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_reader
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.audit import AuditLog
from app.models.dataset import DataCleaningHistory, DatasetVersion
from app.models.user import User
from app.schemas.dataset import (
    DatasetPreviewResponse,
    DatasetUploadMetadata,
    DatasetUploadResponse,
)
from app.schemas.dataset_normalization import (
    DatasetExportRequest,
    DatasetExportResult,
    DatasetNormalizeResult,
    DatasetVersionListItem,
    DatasetVersionResubmitRequest,
    DatasetVersionResubmitResponse,
    DatasetVersionStatusResponse,
    DatasetVersionSubmitRequest,
    DatasetVersionSubmitResponse,
    NormalizedDataValidationResponse,
    ProcessingReportResponse,
)
from app.services.dataset_mapping_service import (
    DatasetMappingNotFoundError,
    apply_saved_column_mappings,
)
from app.services.dataset_normalization_service import (
    export_normalized_dataset_service,
    get_processing_report_service,
    normalize_dataset_structure_service,
)
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    get_dataset_preview,
)
from app.services.dataset_service import (
    DatasetConflictError,
    DatasetFileTooLargeError,
    EmptyDatasetFileError,
    UnsupportedDatasetFormatError,
    create_dataset_upload,
)
from app.services.normalized_data_validation_service import (
    validate_normalized_dataset_service,
)

router = APIRouter()


@router.get(
    "/{dataset_id}/preview",
    summary="[Bước 1.2] Xem trước dữ liệu dataset đã upload (raw hoặc normalized)",
)
def preview_dataset(
    dataset_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DatasetPreviewResponse:
    """Read metadata and a paginated sample from the latest dataset version."""
    try:
        preview = get_dataset_preview(
            db,
            dataset_id=dataset_id,
            page=page,
            page_size=page_size,
            representation=representation,
        )
        return apply_saved_column_mappings(
            db,
            dataset_id=dataset_id,
            preview=preview,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[Bước 1.1] Tải dataset giao thông lên",
)
def upload_dataset(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV, JSON, Excel (.xls/.xlsx) hoặc Parquet")],
    name: Annotated[str, Form(min_length=3, max_length=128)],
    source: Annotated[str, Form(min_length=1, max_length=255)],
    location_name: Annotated[str, Form(min_length=1, max_length=255)],
    description: Annotated[str | None, Form()] = None,
    capture_date: Annotated[date | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetUploadResponse:
    """Upload a dataset file with its catalog metadata."""
    try:
        metadata = DatasetUploadMetadata(
            name=name,
            source=source,
            location_name=location_name,
            description=description,
            capture_date=capture_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    try:
        dataset, version = create_dataset_upload(
            db,
            metadata=metadata,
            file_stream=file.file,
            filename=file.filename or "",
            creator_id=current_user.id,
            ip_address=request.client.host if request.client else None,
        )
    except UnsupportedDatasetFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except DatasetFileTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except EmptyDatasetFileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except DatasetConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return DatasetUploadResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        name=dataset.name,
        code=dataset.code,
        source=dataset.source,
        description=dataset.description,
        capture_date=dataset.capture_date,
        location_name=dataset.location_name,
        version_tag=version.version_tag,
        file_format=version.file_format,
        original_filename=version.original_filename or "",
        file_size_bytes=version.file_size_bytes,
        approval_status=version.approval_status,
        created_at=version.created_at,
    )


# =====================================================================
# BƯỚC 4: CHUẨN HÓA CẤU TRÚC (NORMALIZE STRUCTURE)
# =====================================================================
@router.post(
    "/{dataset_id}/normalize",
    response_model=DatasetNormalizeResult,
    status_code=status.HTTP_200_OK,
    summary="[Bước 4.1] Chuẩn hóa bằng mapping đã lưu và bung dòng dữ liệu",
)
def normalize_dataset_structure(
    dataset_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetNormalizeResult:
    """
    Bước 4: Dùng mapping đã lưu ở Bước 2, bung dòng (unpivot) quỹ đạo pNEUMA,
    và trả về bản xem trước dữ liệu đã chuẩn hóa.
    """
    return normalize_dataset_structure_service(
        db=db,
        dataset_id=dataset_id,
        user=current_user,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{dataset_id}/normalize/validate",
    response_model=NormalizedDataValidationResponse,
    status_code=status.HTTP_200_OK,
    summary="[Bước 4.2] Kiểm tra dữ liệu đã chuẩn hóa",
)
def validate_normalized_dataset(
    dataset_id: UUID,
    current_user: User = Depends(require_data_engineer),
) -> NormalizedDataValidationResponse:
    """Check the latest normalized staging output for common data-quality issues."""
    return validate_normalized_dataset_service(dataset_id=dataset_id)


# =====================================================================
# BƯỚC 5: XUẤT PHIÊN BẢN MỚI (EXPORT NORMALIZED DATASET)
# =====================================================================
@router.post(
    "/{dataset_id}/export",
    response_model=DatasetExportResult,
    status_code=status.HTTP_201_CREATED,
    summary="[Bước 5] Xuất file Parquet/CSV và lưu phiên bản mới",
)
def export_normalized_dataset(
    dataset_id: UUID,
    payload: DatasetExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetExportResult:
    """
    Bước 5: Chốt dữ liệu đã chuẩn hóa và xuất ra file mới (mặc định PARQUET để tối ưu dung lượng).
    Tạo bản ghi DatasetVersion và DataCleaningHistory trong cơ sở dữ liệu.
    """
    return export_normalized_dataset_service(
        db=db,
        dataset_id=dataset_id,
        payload=payload,
        user=current_user,
    )


# =====================================================================
# BƯỚC 6: BÁO CÁO XỬ LÝ TỔNG HỢP (GET PROCESSING REPORT)
# =====================================================================
@router.get(
    "/{dataset_id}/versions/{version_id}/report",
    response_model=ProcessingReportResponse,
    summary="[Bước 6] Xem Báo cáo xử lý tổng hợp của phiên bản dataset",
)
def get_processing_report(
    dataset_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> ProcessingReportResponse:
    """
    Bước 6: Truy vấn báo cáo tổng hợp quá trình làm sạch/chuẩn hóa của phiên bản dataset.
    Bao gồm số lượng bản ghi trước/sau, cấu trúc cột, dung lượng file và tham chiếu chất lượng.
    """
    return get_processing_report_service(
        db=db,
        dataset_id=dataset_id,
        version_id=version_id,
    )

@router.get(
    "/versions",
    response_model=list[DatasetVersionListItem],
    summary="Danh sách các phiên bản dataset trên toàn hệ thống, có thể lọc theo trạng thái",
)
def list_all_dataset_versions(
    status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> list[DatasetVersionListItem]:
    """Return all dataset versions across the whole system, optionally filtered by approval status."""
    query = db.query(DatasetVersion)
    if status is not None:
        query = query.filter(DatasetVersion.approval_status == status)

    versions = query.order_by(DatasetVersion.created_at.desc()).all()
    return [
        DatasetVersionListItem(
            dataset_id=version.dataset_id,
            version_id=version.id,
            version_tag=version.version_tag,
            approval_status=version.approval_status,
            submitted_by=version.submitted_by,
            submitted_at=version.submitted_at,
            approved_by=version.approved_by,
            approval_note=version.approval_note,
            created_at=version.created_at,
        )
        for version in versions
    ]


@router.get(
    "/{dataset_id}/versions",
    response_model=list[DatasetVersionListItem],
    summary="Danh sách các versions của dataset_id lọc theo trạng thái phê duyệt",
)
def list_dataset_versions(
    dataset_id: UUID,
    status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> list[DatasetVersionListItem]:
    """Return all versions for a dataset, optionally filtered by approval status."""
    query = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset_id)
    if status is not None:
        query = query.filter(DatasetVersion.approval_status == status)

    versions = query.order_by(DatasetVersion.created_at.desc()).all()
    return [
        DatasetVersionListItem(
            dataset_id=version.dataset_id,
            version_id=version.id,
            version_tag=version.version_tag,
            approval_status=version.approval_status,
            submitted_by=version.submitted_by,
            submitted_at=version.submitted_at,
            approved_by=version.approved_by,
            approval_note=version.approval_note,
            created_at=version.created_at,
        )
        for version in versions
    ]


@router.get(
    "/{dataset_id}/versions/{version_id}/status",
    response_model=DatasetVersionStatusResponse,
    summary="Xem trạng thái và phản hồi phê duyệt của phiên bản dataset",
)
def get_dataset_version_status(
    dataset_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DatasetVersionStatusResponse:
    """Returns the current review status, submit metadata, and rejection note for a dataset version."""
    version = (
        db.query(DatasetVersion)
        .filter(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset hoặc phiên bản không thuộc dataset đã cho.",
        )

    message = None
    if version.approval_status == "REJECTED":
        message = "Phiên bản dataset đã bị từ chối bởi admin. Vui lòng xem ghi chú phản hồi để sửa chữa."
    elif version.approval_status == "APPROVED":
        message = "Phiên bản dataset đã được admin phê duyệt."
    elif version.approval_status == "SUBMITTED":
        message = "Phiên bản dataset đã được gửi cho admin để xét duyệt."

    return DatasetVersionStatusResponse(
        dataset_id=dataset_id,
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        submitted_by=version.submitted_by,
        submitted_at=version.submitted_at,
        approved_by=version.approved_by,
        approval_note=version.approval_note,
        message=message,
    )


@router.post(
    "/{dataset_id}/versions/{version_id}/submit",
    response_model=DatasetVersionSubmitResponse,
    status_code=status.HTTP_200_OK,
    summary="Gửi phiên bản dataset đã export cho admin phê duyệt",
)
def submit_dataset_version_for_admin(
    dataset_id: UUID,
    version_id: UUID,
    payload: DatasetVersionSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetVersionSubmitResponse:
    """Submit an exported dataset version to an admin for approval."""
    version = (
        db.query(DatasetVersion)
        .filter(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset hoặc phiên bản không thuộc dataset đã cho.",
        )

    if version.approval_status in {"APPROVED", "REJECTED"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phiên bản dataset đã có kết quả phê duyệt và không thể gửi lại theo luồng này.",
        )

    has_export_history = (
        db.query(DataCleaningHistory)
        .filter(DataCleaningHistory.dataset_version_id == version_id)
        .first()
    )
    if has_export_history is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phiên bản dataset chưa được export/chuẩn hóa thành phiên bản mới nên không thể submit cho admin.",
        )

    submitted_at = datetime.now(UTC)
    version.approval_status = "SUBMITTED"
    version.submitted_by = current_user.id
    version.submitted_at = submitted_at
    version.approved_by = None
    version.approval_note = payload.note or "Đã gửi cho admin phê duyệt"
    db.commit()
    db.refresh(version)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="SUBMIT_DATASET_FOR_REVIEW",
            resource_type="DATASET_VERSION",
            resource_id=str(version.id),
            details={
                "dataset_id": str(dataset_id),
                "version_id": str(version_id),
                "status": version.approval_status,
                "note": payload.note,
            },
        )
    )
    db.commit()

    return DatasetVersionSubmitResponse(
        dataset_id=dataset_id,
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        submitted_by=current_user.id,
        submitted_at=submitted_at,
        message="Phiên bản dataset đã được gửi đến admin để phê duyệt.",
    )


@router.post(
    "/{dataset_id}/versions/{version_id}/resubmit",
    response_model=DatasetVersionResubmitResponse,
    status_code=status.HTTP_200_OK,
    summary="Data Engineer gửi lại phiên bản sau khi admin từ chối",
)
def resubmit_dataset_version_for_admin(
    dataset_id: UUID,
    version_id: UUID,
    payload: DatasetVersionResubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetVersionResubmitResponse:
    """Allow a data engineer to resubmit a rejected dataset version after fixing the issue."""
    version = (
        db.query(DatasetVersion)
        .filter(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset hoặc phiên bản không thuộc dataset đã cho.",
        )

    if version.approval_status != "REJECTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ phiên bản đã bị từ chối mới có thể gửi lại để admin xem xét.",
        )

    submitted_at = datetime.now(UTC)
    version.approval_status = "SUBMITTED"
    version.submitted_by = current_user.id
    version.submitted_at = submitted_at
    version.approved_by = None
    version.approval_note = payload.note or "Đã sửa theo phản hồi của admin và gửi lại để xem xét."
    db.commit()
    db.refresh(version)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="RESUBMIT_DATASET_FOR_REVIEW",
            resource_type="DATASET_VERSION",
            resource_id=str(version.id),
            details={
                "dataset_id": str(dataset_id),
                "version_id": str(version_id),
                "status": version.approval_status,
                "note": payload.note,
            },
        )
    )
    db.commit()

    return DatasetVersionResubmitResponse(
        dataset_id=dataset_id,
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        submitted_by=current_user.id,
        submitted_at=submitted_at,
        message="Phiên bản dataset đã được gửi lại cho admin để xét duyệt sau khi sửa theo phản hồi.",
    )
