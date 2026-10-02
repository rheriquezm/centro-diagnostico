from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import SyncRun

router = APIRouter(
    prefix="/system",
    tags=["system"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/status")
def status(db: Session = Depends(get_db)) -> dict:
    db_ok = True
    last_sync = {}
    try:
        runs = db.execute(
            select(SyncRun).order_by(desc(SyncRun.started_at)).limit(10)
        ).scalars().all()
        for run in runs:
            last_sync.setdefault(run.connector, _sync_brief(run))
    except Exception:  # noqa: BLE001
        db_ok = False

    return {
        "database": {"ok": db_ok},
        "connectors": {
            "redmine": {
                "configured": bool(settings.REDMINE_API_KEY),
                "url": settings.REDMINE_URL,
                "last_sync": last_sync.get("redmine"),
            },
            "graylog": {
                "configured": bool(settings.GRAYLOG_USER or settings.GRAYLOG_API_TOKEN),
                "url": settings.GRAYLOG_URL,
                "streams": settings.graylog_streams,
                "last_sync": last_sync.get("graylog"),
            },
        },
        "ai": {
            "provider": settings.AI_PROVIDER,
            "configured": settings.AI_PROVIDER != "none",
        },
    }


def _sync_brief(run: SyncRun) -> dict:
    return {
        "status": run.status,
        "items": run.items,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "error": run.error,
    }
