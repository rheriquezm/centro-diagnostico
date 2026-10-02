from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.connectors.redmine import RedmineClient, RedmineError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import Ticket
from app.services.redmine_sync import sync_tickets

router = APIRouter(
    prefix="/redmine",
    tags=["redmine"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/test")
def test_connection() -> dict:
    try:
        return RedmineClient().test_connection()
    except RedmineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/projects")
def projects() -> list[dict]:
    try:
        return RedmineClient().fetch_projects()
    except RedmineError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync(
    background: BackgroundTasks,
    max_issues: int = Query(500, ge=1, le=5000),
) -> dict:
    client = RedmineClient()
    if not client.is_configured():
        raise HTTPException(status_code=400, detail="Redmine no configurado (REDMINE_API_KEY)")
    background.add_task(sync_tickets, max_issues)
    return {"status": "iniciado", "max_issues": max_issues}


@router.get("/resumen")
def resumen(db: Session = Depends(get_db)) -> dict:
    def _count(*conditions) -> int:
        stmt = select(func.count()).select_from(Ticket)
        for condition in conditions:
            stmt = stmt.where(condition)
        return int(db.execute(stmt).scalar_one())

    def agrupar(columna, limite: int = 8, only_open: bool = False):
        stmt = select(columna, func.count())
        if only_open:
            stmt = stmt.where(Ticket.status_is_closed.is_(False))
        filas = db.execute(
            stmt.group_by(columna).order_by(func.count().desc()).limit(limite)
        ).all()
        return [
            {"nombre": nombre or "—", "total": int(cantidad)}
            for nombre, cantidad in filas
            if (nombre or "").strip()
        ]

    abiertos = _count(Ticket.status_is_closed.is_(False))
    return {
        "total": _count(),
        "abiertos": abiertos,
        "cerrados": _count(Ticket.status_is_closed.is_(True)),
        "por_estado": agrupar(Ticket.status),
        "por_prioridad": agrupar(Ticket.priority),
        "por_proyecto": agrupar(Ticket.project_name),
        "por_tracker": agrupar(Ticket.tracker),
        "por_asignado": agrupar(Ticket.assigned_to, only_open=True),
    }


@router.get("/tickets")
def list_tickets(
    project: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    q: str | None = None,
    open_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(Ticket)
    if project:
        stmt = stmt.where(Ticket.project_name == project)
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if open_only:
        stmt = stmt.where(Ticket.status_is_closed.is_(False))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Ticket.subject.ilike(like), Ticket.description.ilike(like)))

    total = int(
        db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    )
    items = list(
        db.execute(
            stmt.order_by(Ticket.updated_on.desc().nullslast()).offset(skip).limit(limit)
        ).scalars()
    )
    return {
        "total": total,
        "items": [
            {
                "id": t.id,
                "redmine_id": t.redmine_id,
                "project_name": t.project_name,
                "tracker": t.tracker,
                "status": t.status,
                "closed": t.status_is_closed,
                "priority": t.priority,
                "category": t.category,
                "assigned_to": t.assigned_to,
                "subject": t.subject,
                "created_on": t.created_on,
                "updated_on": t.updated_on,
                "closed_on": t.closed_on,
            }
            for t in items
        ],
    }
