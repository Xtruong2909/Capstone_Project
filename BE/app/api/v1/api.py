from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    auth,
    dataset_access,
    dataset_mapping,
    datasets,
    ds_temporal_aggregation,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])
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
    datasets.version_router,
    prefix="/datasets",
    tags=["Bước 5: Phiên bản & phê duyệt Dataset"],
)
api_router.include_router(
    dataset_access.approved_router,
    prefix="/datasets",
    tags=["Data Scientist / Business User"],
)
api_router.include_router(
    ds_temporal_aggregation.router,
    prefix="/ds/aggregations",
    tags=["Data Scientist Temporal Aggregation"],
)
