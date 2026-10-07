from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import SyncRun
from app.services.scheduler import get_state

router = APIRouter(
    prefix="/system",
    tags=["system"],
    dependencies=[Depends(get_current_user)],
)


def _sync_brief(run: SyncRun) -> dict:
    return {
        "status": run.status,
        "items": run.items,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "error": run.error,
    }


def _last_runs(db: Session) -> dict:
    runs = (
        db.execute(select(SyncRun).order_by(desc(SyncRun.started_at)).limit(60))
        .scalars()
        .all()
    )
    ultimo: dict = {}
    for run in runs:
        ultimo.setdefault(run.connector, _sync_brief(run))
    return ultimo


def _scheduler_brief() -> dict:
    state = get_state()
    return {
        "enabled": settings.SCHEDULER_ENABLED,
        "interval_minutes": settings.SYNC_INTERVAL_MINUTES,
        "last_run_at": state.get("last_run_at"),
        "next_run_at": state.get("next_run_at"),
    }


@router.get("/connections")
def connections(db: Session = Depends(get_db)) -> dict:
    """Estado consolidado de conectores + sincronizaciones + scheduler."""
    last = {}
    try:
        last = _last_runs(db)
    except Exception:  # noqa: BLE001
        last = {}
    return {
        "scheduler": _scheduler_brief(),
        "connectors": {
            "graylog": {
                "label": "Graylog",
                "configured": bool(settings.GRAYLOG_USER or settings.GRAYLOG_API_TOKEN),
                "detail": settings.GRAYLOG_URL,
                "last_run": last.get("graylog"),
            },
            "redmine": {
                "label": "Redmine",
                "configured": bool(settings.REDMINE_API_KEY),
                "detail": settings.REDMINE_URL,
                "last_run": last.get("redmine"),
            },
            "yale": {
                "label": "Cerradura Yale",
                "configured": bool(settings.YALE_EMAIL and settings.YALE_PASSWORD),
                "detail": "Yale Connect (ASSA ABLOY)",
                "last_run": last.get("yale"),
            },
            "zkbio": {
                "label": "Control de Acceso",
                "configured": bool(settings.ZKBIO_USERNAME and settings.ZKBIO_PASSWORD),
                "detail": settings.ZKBIO_BASE_URL,
                "last_run": last.get("zkbio"),
            },
            "nagios": {
                "label": "Nagios",
                "configured": bool(settings.NAGIOS_USER and settings.NAGIOS_PASSWORD),
                "detail": settings.NAGIOS_URL,
                "last_run": last.get("nagios"),
            },
        },
        "ai": {
            "provider": settings.AI_PROVIDER,
            "configured": settings.AI_PROVIDER != "none",
        },
    }


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
