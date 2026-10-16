from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth, datasets

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])
api_router.include_router(datasets.router, prefix="/datasets", tags=["Data Engineer"])
