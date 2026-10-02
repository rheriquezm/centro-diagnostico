from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Liveness: la app responde."""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENVIRONMENT}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict:
    """Readiness: la app y la base de datos estan disponibles."""
    db.execute(text("SELECT 1"))
    return {"status": "ready"}
