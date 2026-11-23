from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    admin_portal,
    auth,
    dataset_access,
    dataset_batches,
    dataset_mapping,
    datasets,
    direct_upload,
    ds_temporal_aggregation,
)

api_router = APIRouter()
api_router.include_router(dataset_batches.router, prefix='/datasets', tags=['Dataset Batch Management'])
api_router.include_router(direct_upload.router, prefix='/datasets/direct-upload', tags=['Direct S3 Upload'])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])
api_router.include_router(admin_portal.router, prefix="/admin/portal", tags=["Administration"])
api_router.include_router(
    dataset_access.admin_router,
    prefix="/admin/datasets",
    tags=["Quản lý quyền truy cập Dataset"],
)
api_router.include_router(
    dataset_access.router, prefix="/datasets", tags=["Quản lý quyền truy cập Dataset"]
)
api_router.include_router(datasets.router, prefix="/datasets", tags=["Data Engineer"])
api_router.include_router(
    datasets.upload_router,
    prefix="/datasets",
    tags=["pNEUMA Dataset Upload Bước 1"],
)
api_router.include_router(
    datasets.review_router,
    prefix="/datasets",
    tags=["Dataset Preview & Review Bước 2"],
)
api_router.include_router(
    dataset_mapping.router,
    prefix="/datasets",
    tags=["Dataset Column Mapping Bước 3"],
)
api_router.include_router(
    datasets.normalization_router,
    prefix="/datasets",
    tags=["Bước 4: Chuẩn hóa Dataset"],
)
api_router.include_router(
    datasets.file_router,
    prefix="/datasets",
    tags=["Bước 5: dữ liệu & phê duyệt Dataset"],
)
api_router.include_router(
    dataset_access.approved_router,
    prefix="/datasets",
    tags=["Data Scientist Dataset Access"],
)
api_router.include_router(
    ds_temporal_aggregation.router,
    prefix="/ds/aggregations",
    tags=["Data Scientist Temporal Aggregation"],
)
