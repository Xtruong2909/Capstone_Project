from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException

from app.core.config import ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES, MAX_DATASET_UPLOAD_BATCH_BYTES
from app.core.dataset_access import require_dataset_reader
from app.core.deps import get_current_user, require_data_engineer
from app.crud import crud_dataset
from app.database.database import get_db
from app.models.dataset import DataCleaningHistory, DatasetVersion
from app.models.user import User
from app.schemas.dataset import (
    DatasetBatchUploadResponse,
    DatasetPreviewResponse,
    DatasetUploadJobResponse,
    DatasetUploadMetadata,
    DatasetUploadResponse,
    GroupDatasetListResponse,
    RecordingSessionDetail,
    RecordingSessionListResponse,
    RecordingSessionPreviewResponse,
    UploadedDatasetDetail,
    UploadedDatasetListResponse,
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
    GroupDatasetVersionsResponse,
    GroupProcessingJobResponse,
    GroupProcessingReportResponse,
    GroupVersionStatusResponse,
    GroupVersionSubmitRequest,
    ProcessingReportResponse,
)
from app.services import pneuma_upload_service
from app.services.audit_log_service import audit_action, record_audit_event
from app.services.dataset_consumer_service import (
    list_approved_recording_sessions,
    preview_approved_recording_session,
    require_approved_version,
)
from app.services.dataset_group_processing_service import (
    get_group_processing_result,
    run_group_processing_job,
    start_group_processing,
)
from app.services.dataset_group_version_service import (
    get_group_processing_report,
    get_group_version_status,
    list_group_versions,
    resubmit_group_versions,
    submit_group_versions,
)
from app.services.dataset_mapping_service import (
    DatasetMappingNotFoundError,
    apply_saved_column_mappings,
)
from app.services.dataset_multipart_service import StreamedUploadFile, receive_dataset_form
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
from app.services.dataset_review_service import (
    get_recording_session_detail,
    get_uploaded_dataset_detail,
    list_datasets_in_group,
    list_recording_sessions,
    list_uploaded_datasets,
    preview_recording_session,
    resolve_group_dataset_version,
)
from app.services.dataset_service import (
    DatasetConflictError,
    DatasetFileTooLargeError,
    EmptyDatasetFileError,
    UnsupportedDatasetFormatError,
    create_dataset_upload,
)
from app.services.dataset_version_service import get_version_source_context
from app.services.dataset_version_service import (
    list_dataset_versions as list_dataset_versions_service,
)
from app.services.pneuma_upload_service import (
    get_pneuma_upload_job_response,
    prepare_pneuma_batch,
    run_pneuma_upload_job,
    upload_pneuma_batch,
)

router = APIRouter()
upload_router = APIRouter()
review_router = APIRouter()
normalization_router = APIRouter()
version_router = APIRouter()


@version_router.get(
    "/groups/{group_id}/versions",
    response_model=GroupDatasetVersionsResponse,
    summary="Liệt kê phiên bản của tất cả Dataset trong nhóm",
)
def list_group_dataset_versions_endpoint(
    group_id: UUID,
    approval_status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = Query(
        default=None, alias="status",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupDatasetVersionsResponse:
    return list_group_versions(db, group_id, approval_status)


@version_router.get(
    "/groups/{group_id}/report",
    response_model=GroupProcessingReportResponse,
    summary="Báo cáo chuẩn hóa và các Session của nhóm đã Export",
)
def get_group_processing_report_endpoint(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupProcessingReportResponse:
    return get_group_processing_report(db, group_id)


@version_router.get(
    "/groups/{group_id}/status",
    response_model=GroupVersionStatusResponse,
    summary="Trạng thái duyệt của các phiên bản trong nhóm đã Export",
)
def get_group_version_status_endpoint(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupVersionStatusResponse:
    return get_group_version_status(db, group_id)


@version_router.post(
    "/groups/{group_id}/submit",
    response_model=GroupVersionStatusResponse,
    summary="Gửi tất cả phiên bản đã Export trong nhóm cho Admin duyệt",
)
def submit_group_versions_endpoint(
    group_id: UUID,
    payload: GroupVersionSubmitRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupVersionStatusResponse:
    return submit_group_versions(db, group_id, current_user, note=payload.comment if payload else None)


@version_router.post(
    "/groups/{group_id}/resubmit",
    response_model=GroupVersionStatusResponse,
    summary="Gửi lại các phiên bản bị từ chối trong nhóm",
)
def resubmit_group_versions_endpoint(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupVersionStatusResponse:
    return resubmit_group_versions(db, group_id, current_user)


@upload_router.get(
    "", response_model=UploadedDatasetListResponse, response_model_exclude_none=True,
    summary="Danh sách nhóm Dataset pNEUMA đã upload",
)
def list_uploaded_dataset_groups(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: str | None = None,
    group_id: UUID | None = None,
    drone_id: Annotated[str | None, Query(pattern=r"^[dD][0-9]+$")] = None,
    recording_date_from: date | None = None,
    recording_date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UploadedDatasetListResponse:
    """Show groups once; pass group_id to expand the datasets in one group."""
    if (recording_date_from is not None and recording_date_to is not None
            and recording_date_from > recording_date_to):
        raise HTTPException(status_code=422, detail="recording_date_from must not exceed recording_date_to")
    return list_uploaded_datasets(
        db, current_user, search=search, page=page, page_size=page_size,
        group_id=group_id,
        drone_id=drone_id,
        recording_date_from=recording_date_from,
        recording_date_to=recording_date_to,
    )


@router.get(
    "/{dataset_id}/preview",
    summary="Xem trước dữ liệu dataset đã upload (raw hoặc normalized)",
    include_in_schema=False,
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


@upload_router.post(
    "/upload",
    response_model=DatasetUploadResponse | DatasetBatchUploadResponse,
    status_code=status.HTTP_201_CREATED,
    responses={202: {"model": DatasetUploadJobResponse}},
    description=(
        "Chọn CSV của nhiều ngày trong một lần upload. Tên file "
        "YYYYMMDD_dX_HHMM_HHMM.csv quyết định Dataset YYYYMMDD-dX và Recording Session. "
        "Ví dụ 20 file của d1 trong 4 ngày tạo 4 Dataset, mỗi Dataset có 5 Session. "
        "Ngày ghi hình và drone được tự động lấy từ tên từng file."
    ),
    summary="Tải dataset giao thông lên",
    openapi_extra={"requestBody": {"required": True, "content": {"multipart/form-data": {
        "schema": {"type": "object", "required": ["files"], "properties": {
            "group_name": {"type": "string", "maxLength": 128, "example": "", "description": "Tên chung cho các Dataset của cùng một drone (tùy chọn)"},
            "files": {"type": "array", "items": {"type": "string", "format": "binary"},
                      "description": "Kéo thả nhiều file CSV vào vùng phía trên hoặc bấm vào đó để chọn nhiều file cùng lúc"},
            "source": {"type": "string", "example": "", "description": "Nguồn dữ liệu; để trống dùng pNEUMA"},
            "location_name": {"type": "string", "example": "", "description": "Địa điểm; để trống dùng Athens, Greece"},
            "description": {"type": "string", "example": "", "description": "Mô tả Dataset (tùy chọn)"},
        }},
    }}}},
)
async def upload_dataset(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetUploadResponse | DatasetBatchUploadResponse | JSONResponse:
    """Upload CSV recordings via multipart/form-data.

    Swagger shows ``files`` and optional metadata for pNEUMA recordings.
    Dataset name is always derived from each filename in this flow.
    Existing clients may still send a single ``file`` with name, source,
    and location_name to retain the legacy request and response.
    """
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_DATASET_UPLOAD_BATCH_BYTES + 64 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dung lượng request vượt giới hạn batch")
    # Parse here so Starlette's default 1000-file limit does not reject valid batches.
    # Count bytes as they arrive, including requests without Content-Length.
    received_bytes = 0

    async def capped_receive() -> dict:
        nonlocal received_bytes
        message = await request.receive()
        received_bytes += len(message.get("body", b""))
        if received_bytes > MAX_DATASET_UPLOAD_BATCH_BYTES + 64 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Dung lượng request vượt giới hạn batch")
        return message

    form_request = Request(request.scope, receive=capped_receive)
    try:
        form = await receive_dataset_form(
            form_request.headers, form_request.stream(),
            pneuma_upload_service.DATASET_UPLOAD_DIR,
        )
    except MultiPartException as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    try:
        return await _finish_dataset_upload_form(
            request, form, background_tasks, db, current_user,
        )
    finally:
        await form.close()


async def _finish_dataset_upload_form(
    request: Request, form: FormData, background_tasks: BackgroundTasks,
    db: Session, current_user: User,
) -> DatasetUploadResponse | DatasetBatchUploadResponse | JSONResponse:
    selected_files = form.getlist("file") + form.getlist("files")
    if any(not isinstance(item, UploadFile) for item in selected_files):
        raise HTTPException(status_code=422, detail="file/files phải là tệp multipart")
    name = form.get("name")
    group_name = form.get("group_name")
    source = form.get("source")
    location_name = form.get("location_name")
    description = form.get("description")
    capture_date_value = form.get("capture_date")
    if any(value is not None and not isinstance(value, str)
           for value in (name, group_name, source, location_name, description, capture_date_value)):
        raise HTTPException(status_code=422, detail="Metadata multipart không hợp lệ")
    source = source.strip() or None if source is not None else None
    group_name = group_name.strip() or None if group_name is not None else None
    if group_name is not None and len(group_name) > 128:
        raise HTTPException(status_code=422, detail="group_name tối đa 128 ký tự")
    location_name = location_name.strip() or None if location_name is not None else None
    description = description.strip() or None if description is not None else None
    if source is not None and len(source) > 255 or location_name is not None and len(location_name) > 255:
        raise HTTPException(status_code=422, detail="source/location_name tối đa 255 ký tự")
    try:
        capture_date = date.fromisoformat(capture_date_value) if capture_date_value else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="capture_date phải theo YYYY-MM-DD") from exc
    if not selected_files:
        raise HTTPException(status_code=422, detail="Cần cung cấp file hoặc files")
    if form.getlist("files") or len(selected_files) > 1 or name is None or source is None or location_name is None:
        upload_files = [(item.filename or "", item.file) for item in selected_files]
        if sum(item.size or 0 for item in selected_files) >= ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES:
            try:
                prepared = await run_in_threadpool(
                    prepare_pneuma_batch, upload_files, name, source, location_name,
                    capture_date, description, group_name,
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            job_id = uuid4()
            try:
                await run_in_threadpool(
                    crud_dataset.create_upload_job, db, job_id, current_user.id,
                    prepared.total_files,
                )
            except Exception:
                prepared.cleanup()
                raise
            background_tasks.add_task(
                run_pneuma_upload_job, job_id, prepared, current_user.id,
                request.client.host if request.client else None,
            )
            return JSONResponse(status_code=202, content=DatasetUploadJobResponse(
                job_id=job_id, status="PENDING", total_files=prepared.total_files,
                processed_files=0,
            ).model_dump(mode="json"))
        try:
            return await run_in_threadpool(
                upload_pneuma_batch,
                db, upload_files,
                creator_id=current_user.id,
                ip_address=request.client.host if request.client else None,
                name=name, source=source, location_name=location_name,
                capture_date=capture_date, description=description,
                group_name=group_name,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    file = selected_files[0]
    if isinstance(file.file, StreamedUploadFile) and file.file.error is not None:
        raise HTTPException(status_code=413, detail=file.file.error)
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
        with audit_action(
            action="UPLOAD_DATASET",
            module="Dataset",
            description="Dataset uploaded successfully",
            user=current_user,
            ip_address=request.client.host if request.client else None,
            details={"filename": file.filename or ""},
            record_success=False,
        ):
            dataset, version = await run_in_threadpool(
                create_dataset_upload,
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


@upload_router.get("/upload/jobs/{job_id}", response_model=DatasetUploadJobResponse,
            summary="Xem trạng thái upload pNEUMA")
def get_upload_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetUploadJobResponse:
    return get_pneuma_upload_job_response(db, job_id, current_user.id)


# =====================================================================
# BƯỚC 4: CHUẨN HÓA CẤU TRÚC (NORMALIZE STRUCTURE)
# =====================================================================
@normalization_router.post(
    "/groups/{group_id}/normalize",
    response_model=GroupProcessingJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Chuẩn hóa mọi Dataset và Session trong nhóm",
    description="Chỉ nhập group_id. Job chạy lần lượt từng Dataset theo ngày; xem tiến độ qua API processing-jobs.",
)
def normalize_group_datasets(
    group_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupProcessingJobResponse:
    result = start_group_processing(
        db, group_id=group_id, operation="NORMALIZE", user=current_user,
    )
    background_tasks.add_task(run_group_processing_job, result.job_id)
    return result


@normalization_router.post(
    "/groups/{group_id}/export",
    response_model=GroupProcessingJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Xuất các Dataset đã chuẩn hóa trong nhóm",
    description="Chỉ nhập group_id sau khi job chuẩn hóa hoàn tất; mỗi Dataset có phiên bản xuất riêng.",
)
def export_group_datasets(
    group_id: UUID,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupProcessingJobResponse:
    result = start_group_processing(
        db, group_id=group_id, operation="EXPORT", user=current_user,
    )
    if result.status == "PENDING":
        background_tasks.add_task(run_group_processing_job, result.job_id)
    else:
        response.status_code = status.HTTP_200_OK
    return result


@normalization_router.get(
    "/groups/{group_id}/processing-jobs/{job_id}",
    response_model=GroupProcessingJobResponse,
    summary="Theo dõi tiến độ chuẩn hóa hoặc xuất nhóm Dataset",
)
def get_group_processing_job(
    group_id: UUID,
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupProcessingJobResponse:
    return get_group_processing_result(
        db, group_id=group_id, job_id=job_id, user_id=current_user.id,
    )


@normalization_router.post(
    "/{dataset_id}/normalize",
    include_in_schema=False,
    response_model=DatasetNormalizeResult,
    status_code=status.HTTP_200_OK,
    summary="Chuẩn hóa mọi Session của Dataset Version bằng mapping đã lưu",
    description=(
        "Mỗi Dataset theo ngày được xử lý riêng. Nếu bỏ version_id, hệ thống chọn "
        "phiên bản nguồn mới nhất có Recording Session. Kết quả gồm staging_id "
        "để xuất phiên bản đã chuẩn hóa ở bước tiếp theo."
    ),
)
def normalize_dataset_structure(
    dataset_id: UUID,
    version_id: UUID | None = Query(
        default=None,
        description="Dataset Version nguồn; nếu bỏ trống, hệ thống chọn phiên bản raw mới nhất.",
    ),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetNormalizeResult:
    """
    Bước 4: Dùng mapping đã lưu ở Bước 3, bung dòng (unpivot) quỹ đạo pNEUMA,
    và trả về bản xem trước dữ liệu đã chuẩn hóa.
    """
    return normalize_dataset_structure_service(
        db=db,
        dataset_id=dataset_id,
        user=current_user,
        version_id=version_id,
        page=page,
        page_size=page_size,
    )


# =====================================================================
# BƯỚC 4: XUẤT PHIÊN BẢN ĐÃ CHUẨN HÓA (EXPORT NORMALIZED DATASET)
# =====================================================================
@normalization_router.post(
    "/{dataset_id}/export",
    include_in_schema=False,
    response_model=DatasetExportResult,
    status_code=status.HTTP_201_CREATED,
    summary="Xuất dữ liệu đã chuẩn hóa thành Dataset Version mới",
    description=(
        "Xuất kết quả chuẩn hóa của Dataset theo ngày thành phiên bản mới. "
        "Có thể truyền staging_id từ API normalize để chọn đúng kết quả cần xuất."
    ),
)
def export_normalized_dataset(
    dataset_id: UUID,
    payload: DatasetExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetExportResult:
    """
    Bước 4: Chốt dữ liệu đã chuẩn hóa và xuất ra file mới (mặc định PARQUET để tối ưu dung lượng).
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
    include_in_schema=False,
    summary="Xem báo cáo chuẩn hóa kèm các Recording Session nguồn",
)
def get_processing_report(
    dataset_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> ProcessingReportResponse:
    """Return normalization counts, mappings, file details, and source version for this version."""
    return get_processing_report_service(
        db=db,
        dataset_id=dataset_id,
        version_id=version_id,
    )

@router.get(
    "/versions",
    response_model=list[DatasetVersionListItem],
    include_in_schema=False,
    summary="Liệt kê phiên bản Dataset và các Recording Session nguồn",
)
def list_all_dataset_versions(
    status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> list[DatasetVersionListItem]:
    """List versions with the source Dataset and sessions represented by each version."""
    return list_dataset_versions_service(db, approval_status=status)


@router.get(
    "/{dataset_id}/versions",
    response_model=list[DatasetVersionListItem],
    include_in_schema=False,
    summary="Liệt kê phiên bản của Dataset kèm các Recording Session",
)
def list_dataset_versions(
    dataset_id: UUID,
    status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> list[DatasetVersionListItem]:
    """List a Dataset's versions with their linked source sessions."""
    return list_dataset_versions_service(db, dataset_id=dataset_id, approval_status=status)


@router.get(
    "/{dataset_id}/versions/{version_id}/status",
    response_model=DatasetVersionStatusResponse,
    include_in_schema=False,
    summary="Xem trạng thái duyệt và các Recording Session của phiên bản",
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

    source_version_id, source_version_tag, source_sessions = get_version_source_context(db, version)
    return DatasetVersionStatusResponse(
        dataset_id=dataset_id,
        dataset_name=getattr(getattr(version, "dataset", None), "name", None),
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        source_version_id=source_version_id,
        source_version_tag=source_version_tag,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        submitted_by=version.submitted_by,
        submitted_at=version.submitted_at,
        approved_by=version.approved_by,
        approval_note=version.approval_note,
        message=message,
    )


@router.post(
    "/{dataset_id}/versions/{version_id}/submit",
    response_model=DatasetVersionSubmitResponse,
    include_in_schema=False,
    status_code=status.HTTP_200_OK,
    summary="Gửi phiên bản cùng thông tin Recording Session nguồn cho Admin xét duyệt",
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

    record_audit_event(
        user=current_user,
        action="SUBMIT_DATASET_FOR_REVIEW",
        module="Dataset",
        status="SUCCESS",
        description="Dataset version submitted for review",
        resource_id=version.id,
        details={"dataset_id": str(dataset_id), "status": version.approval_status},
    )

    source_version_id, source_version_tag, source_sessions = get_version_source_context(db, version)
    return DatasetVersionSubmitResponse(
        dataset_id=dataset_id,
        dataset_name=getattr(getattr(version, "dataset", None), "name", None),
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        source_version_id=source_version_id,
        source_version_tag=source_version_tag,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        submitted_by=current_user.id,
        submitted_at=submitted_at,
        message="Phiên bản dataset đã được gửi đến admin để phê duyệt.",
    )


@router.post(
    "/{dataset_id}/versions/{version_id}/resubmit",
    response_model=DatasetVersionResubmitResponse,
    include_in_schema=False,
    status_code=status.HTTP_200_OK,
    summary="Gửi lại phiên bản và các Recording Session nguồn sau khi bị từ chối",
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

    record_audit_event(
        user=current_user,
        action="RESUBMIT_DATASET_FOR_REVIEW",
        module="Dataset",
        status="SUCCESS",
        description="Dataset version resubmitted for review",
        resource_id=version.id,
        details={"dataset_id": str(dataset_id), "status": version.approval_status},
    )

    source_version_id, source_version_tag, source_sessions = get_version_source_context(db, version)
    return DatasetVersionResubmitResponse(
        dataset_id=dataset_id,
        dataset_name=getattr(getattr(version, "dataset", None), "name", None),
        version_id=version.id,
        version_tag=version.version_tag,
        approval_status=version.approval_status,
        source_version_id=source_version_id,
        source_version_tag=source_version_tag,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        submitted_by=current_user.id,
        submitted_at=submitted_at,
        message="Phiên bản dataset đã được gửi lại cho admin để xét duyệt sau khi sửa theo phản hồi.",
    )


@review_router.get(
    "/groups/{group_id}/datasets",
    response_model=GroupDatasetListResponse,
    summary="Xem các Dataset trong nhóm",
)
def review_group_datasets(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupDatasetListResponse:
    try:
        return list_datasets_in_group(db, group_id, current_user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@review_router.get(
    "/groups/{group_id}/datasets/{dataset_id}/sessions",
    response_model=RecordingSessionListResponse,
    summary="Xem các Recording Session của Dataset trong nhóm",
)
def review_group_dataset_sessions(
    group_id: UUID,
    dataset_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> RecordingSessionListResponse:
    try:
        version = resolve_group_dataset_version(db, group_id, dataset_id, current_user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return review_recording_sessions(dataset_id, version.id, page, page_size, db, current_user)


@review_router.get(
    "/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}",
    response_model=RecordingSessionPreviewResponse,
    summary="Xem dữ liệu của Recording Session trong nhóm",
    responses={
        404: {"description": "Nhóm, Dataset, Session hoặc file CSV không tồn tại"},
        415: {"description": "Session không chứa file CSV"},
        422: {"description": "CSV lỗi định dạng hoặc không đọc được"},
    },
)
def review_group_dataset_session_data(
    group_id: UUID,
    dataset_id: UUID,
    session_id: UUID,
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    column_offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> RecordingSessionPreviewResponse:
    try:
        version = resolve_group_dataset_version(db, group_id, dataset_id, current_user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return review_recording_session_preview(
        dataset_id, version.id, session_id, page, limit, column_offset,
        representation, db, current_user,
    )


@review_router.get(
    "/{dataset_id:uuid}", response_model=UploadedDatasetDetail,
    include_in_schema=False,
    summary="Chi tiết Dataset theo ngày và các Dataset cùng drone",
)
def review_uploaded_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> UploadedDatasetDetail:
    try:
        return get_uploaded_dataset_detail(db, dataset_id, current_user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@review_router.get(
    "/{dataset_id}/versions/{version_id}/sessions",
    response_model=RecordingSessionListResponse,
    summary="Danh sách Recording Sessions của một Dataset Version",
    include_in_schema=False,
)
def review_recording_sessions(
    dataset_id: UUID,
    version_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> RecordingSessionListResponse:
    if current_user.role_id in ("data_scientist", "business_user"):
        return list_approved_recording_sessions(
            db, current_user, dataset_id, version_id, page, page_size,
        )
    try:
        return list_recording_sessions(
            db, dataset_id, version_id, page=page, page_size=page_size,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@review_router.get(
    "/{dataset_id}/versions/{version_id}/sessions/{session_id}",
    response_model=RecordingSessionDetail,
    include_in_schema=False,
    summary="Chi tiết Recording Session thuộc Dataset theo ngày",
)
def review_recording_session(
    dataset_id: UUID,
    version_id: UUID,
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> RecordingSessionDetail:
    if current_user.role_id in ("data_scientist", "business_user"):
        require_approved_version(db, current_user, dataset_id, version_id)
    try:
        return get_recording_session_detail(db, dataset_id, version_id, session_id)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@review_router.get(
    "/{dataset_id}/versions/{version_id}/sessions/{session_id}/preview",
    response_model=RecordingSessionPreviewResponse,
    summary="Preview một Recording Session dạng bảng (pNEUMA chuẩn hóa hoặc CSV gốc)",
    description=(
        "Ở chế độ normalized, áp dụng Dataset Column Mapping đã lưu vào tên cột và trả "
        "mapping_applied=true nếu có đổi tên. Chế độ raw luôn giữ nguyên header CSV gốc."
    ),
    responses={
        404: {"description": "Session hoặc file CSV không tồn tại"},
        415: {"description": "Session không chứa file CSV"},
        422: {"description": "CSV lỗi định dạng hoặc không đọc được"},
    },
    include_in_schema=False,
)
def review_recording_session_preview(
    dataset_id: UUID,
    version_id: UUID,
    session_id: UUID,
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    column_offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> RecordingSessionPreviewResponse:
    """Show pNEUMA trajectory points as typed rows, or original CSV rows with raw."""
    if current_user.role_id in ("data_scientist", "business_user"):
        return preview_approved_recording_session(
            db, current_user, dataset_id, version_id, session_id,
            page=page, limit=limit, column_offset=column_offset,
            representation=representation,
        )
    try:
        return preview_recording_session(
            db, dataset_id, version_id, session_id,
            page=page, limit=limit, column_offset=column_offset,
            representation=representation,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
