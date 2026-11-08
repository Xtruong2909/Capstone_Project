import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.api import api_router
from app.api.v1.endpoints.ai_assistant import router as ai_assistant_router
from app.api.v1.endpoints.feature_engineering import router as feature_engineering_router
from app.api.v1.endpoints.model_prediction import router as model_prediction_router
from app.api.v1.endpoints.model_training import router as model_training_router
from app.api.v1.endpoints.train_test_split import router as train_test_split_router
from app.core.config import API_V1_STR, PROJECT_NAME, VERSION
from app.database.database import get_db
from app.services.audit_log_service import record_audit_event

app = FastAPI(
    title=PROJECT_NAME,
    version=VERSION,
    openapi_url=f"{API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware Configuration for Frontend Access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers
app.include_router(api_router, prefix=API_V1_STR)
app.include_router(feature_engineering_router, prefix="/api")
app.include_router(train_test_split_router, prefix="/api")
app.include_router(model_training_router, prefix="/api")
app.include_router(model_prediction_router, prefix="/api")
app.include_router(ai_assistant_router, prefix="/api")


@app.exception_handler(Exception)
async def audit_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    logging.getLogger(__name__).error(
        "Unhandled API error",
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    record_audit_event(
        action="SYSTEM_ERROR",
        module="System",
        status="FAILED",
        description="Unhandled system error",
        ip_address=request.client.host if request.client else None,
        resource_id=request.url.path,
        details={"method": request.method, "error_type": type(exc).__name__},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.get("/", summary="Root API Endpoint")
def root():
    return {
        "message": f"Welcome to {PROJECT_NAME}",
        "version": VERSION,
        "docs": "/docs",
        "api_v1": API_V1_STR,
    }


@app.get("/health/db", tags=["Health"], summary="Check Database Connection")
def check_database(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "connected", "database": "PostgreSQL"}
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc
