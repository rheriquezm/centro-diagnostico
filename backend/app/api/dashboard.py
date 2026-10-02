from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import Correlation, ErrorFingerprint, Finding, Ticket

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


def _count(db: Session, model, *conditions) -> int:
    stmt = select(func.count()).select_from(model)
    for condition in conditions:
        stmt = stmt.where(condition)
    return int(db.execute(stmt).scalar_one())


@router.get("/summary")
def summary(db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)

    return {
        "errores_24h": _count(
            db, ErrorFingerprint, ErrorFingerprint.last_seen >= now - timedelta(hours=24)
        ),
        "errores_7d": _count(
            db, ErrorFingerprint, ErrorFingerprint.last_seen >= now - timedelta(days=7)
        ),
        "errores_criticos": _count(
            db, ErrorFingerprint, ErrorFingerprint.severity.in_(("ERROR", "FATAL"))
        ),
        "fingerprints_total": _count(db, ErrorFingerprint),
        "tickets_abiertos": _count(db, Ticket, Ticket.status_is_closed.is_(False)),
        "tickets_cerrados": _count(db, Ticket, Ticket.status_is_closed.is_(True)),
        "tickets_total": _count(db, Ticket),
        "errores_sin_ticket": _count(db, Finding, Finding.type == "sin_ticket"),
        "reincidencias": _count(db, Finding, Finding.type == "reincidencia"),
        "problemas_nuevos": _count(db, Finding, Finding.type == "nuevo"),
        "correlaciones": _count(db, Correlation),
    }


@router.get("/trend")
def trend(days: int = 7, db: Session = Depends(get_db)) -> dict:
    """Errores por dia (agregado). Vacio hasta que existan datos reales."""
    now = datetime.now(timezone.utc)
    series = []
    for offset in range(days - 1, -1, -1):
        day = (now - timedelta(days=offset)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        next_day = day + timedelta(days=1)
        total = _count(
            db,
            ErrorFingerprint,
            ErrorFingerprint.last_seen >= day,
            ErrorFingerprint.last_seen < next_day,
        )
        series.append({"fecha": day.date().isoformat(), "total": total})
    return {"series": series}
