from fastapi import APIRouter

from app.api.v1.endpoints import health, auth, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["Health Check"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & Roles"])
api_router.include_router(users.router, prefix="/users", tags=["User & Role Management (Admin)"])
