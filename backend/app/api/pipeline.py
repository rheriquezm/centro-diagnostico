from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import Correlation, Finding, Ticket
from app.services.correlation import run_correlation
from app.services.findings import run_findings
from app.services.scheduler import get_state, run_cycle_tracked

router = APIRouter(tags=["pipeline"], dependencies=[Depends(get_current_user)])


@router.post("/scheduler/run-now")
def scheduler_run_now(background: BackgroundTasks) -> dict:
    background.add_task(run_cycle_tracked)
    return {"status": "iniciado"}


@router.get("/scheduler/status")
def scheduler_status() -> dict:
    state = get_state()
    return {
        "enabled": settings.SCHEDULER_ENABLED,
        "interval_minutes": settings.SYNC_INTERVAL_MINUTES,
        "redmine_max_issues": settings.REDMINE_SYNC_MAX_ISSUES,
        "graylog_range_hours": settings.GRAYLOG_SYNC_RANGE_HOURS,
        "graylog_max_messages": settings.GRAYLOG_SYNC_MAX_MESSAGES,
        "started_at": state.get("started_at"),
        "last_run_at": state.get("last_run_at"),
        "next_run_at": state.get("next_run_at"),
        "last_result": state.get("last_result"),
    }


@router.post("/pipeline/run")
def run_pipeline() -> dict:
    correlaciones = run_correlation()
    hallazgos = run_findings()
    return {"correlaciones": correlaciones, "hallazgos": hallazgos}


@router.get("/findings")
def list_findings(tipo: str | None = None, db: Session = Depends(get_db)) -> dict:
    stmt = select(Finding).order_by(desc(Finding.created_at))
    if tipo:
        stmt = stmt.where(Finding.type == tipo)
    items = list(db.execute(stmt.limit(200)).scalars())
    return {
        "total": len(items),
        "items": [
            {
                "id": f.id,
                "type": f.type,
                "title": f.title,
                "detail": f.detail,
                "severity": f.severity,
                "fingerprint_id": f.fingerprint_id,
                "ticket_id": f.ticket_id,
                "created_at": f.created_at,
            }
            for f in items
        ],
    }


@router.get("/correlations")
def list_correlations(db: Session = Depends(get_db)) -> dict:
    correlations = list(
        db.execute(select(Correlation).order_by(desc(Correlation.score)).limit(200)).scalars()
    )
    tickets = {t.id: t for t in db.execute(select(Ticket)).scalars()}
    return {
        "total": len(correlations),
        "items": [
            {
                "id": c.id,
                "fingerprint_id": c.fingerprint_id,
                "score": c.score,
                "method": c.method,
                "evidence": c.evidence,
                "ticket": {
                    "redmine_id": tickets[c.ticket_id].redmine_id,
                    "subject": tickets[c.ticket_id].subject,
                    "status": tickets[c.ticket_id].status,
                    "closed": tickets[c.ticket_id].status_is_closed,
                }
                if c.ticket_id in tickets
                else None,
            }
            for c in correlations
        ],
    }
