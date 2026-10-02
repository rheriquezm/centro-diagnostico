from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ErrorBucket, ErrorFingerprint, Finding, Ticket

router = APIRouter(
    prefix="/continuous",
    tags=["continuous"],
    dependencies=[Depends(get_current_user)],
)


def _count_findings(db: Session, tipo: str, since: datetime) -> int:
    return int(
        db.execute(
            select(func.count(Finding.id)).where(
                Finding.type == tipo, Finding.created_at >= since
            )
        ).scalar_one()
    )


def _count_buckets(db: Session, start: datetime, end: datetime) -> int:
    return int(
        db.execute(
            select(func.coalesce(func.sum(ErrorBucket.count), 0)).where(
                ErrorBucket.bucket_hour >= start, ErrorBucket.bucket_hour < end
            )
        ).scalar_one()
    )


@router.get("/indicators")
def indicators(
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    inicio = now - timedelta(hours=hours)
    inicio_prev = inicio - timedelta(hours=hours)

    actual = _count_buckets(db, inicio, now)
    anterior = _count_buckets(db, inicio_prev, inicio)
    variacion = (
        round((actual - anterior) / anterior * 100, 1) if anterior else None
    )

    return {
        "ventana_horas": hours,
        "errores_actual": actual,
        "errores_anterior": anterior,
        "variacion_pct": variacion,
        "nuevos": _count_findings(db, "nuevo", inicio),
        "sin_ticket": _count_findings(db, "sin_ticket", inicio),
        "reincidencias": _count_findings(db, "reincidencia", inicio),
        "recurrentes": _count_findings(db, "recurrente", inicio),
        "fingerprints_total": int(
            db.execute(select(func.count(ErrorFingerprint.id))).scalar_one()
        ),
        "tickets_abiertos": int(
            db.execute(
                select(func.count(Ticket.id)).where(Ticket.status_is_closed.is_(False))
            ).scalar_one()
        ),
        "tickets_cerrados": int(
            db.execute(
                select(func.count(Ticket.id)).where(Ticket.status_is_closed.is_(True))
            ).scalar_one()
        ),
    }
