from datetime import date
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

from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset import (
    DatasetPreviewResponse,
    DatasetUploadMetadata,
    DatasetUploadResponse,
)
from app.schemas.dataset_normalization import (
    DatasetExportRequest,
    DatasetExportResult,
    DatasetNormalizeRequest,
    DatasetNormalizeResult,
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

router = APIRouter()


@router.get(
    "/{dataset_id}/preview",
    summary="Xem trước dữ liệu dataset",
)
def preview_dataset(
    dataset_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
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
    summary="Tải dataset giao thông lên",
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
    summary="[Bước 4] Chuẩn hóa cấu trúc và bung dòng dữ liệu",
)
def normalize_dataset_structure(
    dataset_id: UUID,
    payload: DatasetNormalizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetNormalizeResult:
    """
    Bước 4: Áp dụng column mapping và bung dòng (unpivot) quỹ đạo pNEUMA.
    Dữ liệu chuẩn hóa được đưa vào vùng đệm Staging, sẵn sàng để xuất phiên bản mới.
    """
    return normalize_dataset_structure_service(
        db=db,
        dataset_id=dataset_id,
        payload=payload,
        user=current_user,
    )


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
    current_user: User = Depends(require_data_engineer),
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
