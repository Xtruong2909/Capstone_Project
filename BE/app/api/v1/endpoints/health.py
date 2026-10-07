from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db

router = APIRouter()


@router.get("/health", summary="System & Database Health Check")
def health_check(db: Session = Depends(get_db)):
    """Check backend service connectivity to PostgreSQL and PostGIS extension status."""
    try:
        result = db.execute(text("SELECT PostGIS_Full_Version();")).scalar()
        return {
            "status": "online",
            "database": "connected",
            "postgis_version": result,
        }
    except Exception as e:
        return {
            "status": "online",
            "database": "error",
            "detail": str(e),
        }
