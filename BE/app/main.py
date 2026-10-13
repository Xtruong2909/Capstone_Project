from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.api import api_router
from app.core.config import API_V1_STR, PROJECT_NAME, VERSION
from app.database.database import get_db

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