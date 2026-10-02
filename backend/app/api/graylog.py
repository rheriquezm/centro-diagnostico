from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.connectors.graylog import GraylogClient, GraylogError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ErrorFingerprint
from app.services.graylog_sync import sync_graylog

router = APIRouter(
    prefix="/graylog",
    tags=["graylog"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/test")
def test_connection() -> dict:
    try:
        return GraylogClient().test_connection()
    except GraylogError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/streams")
def streams() -> list[dict]:
    try:
        return GraylogClient().list_streams()
    except GraylogError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync(
    background: BackgroundTasks,
    query: str = Query("*"),
    range_seconds: int = Query(86400, ge=60, le=2592000),
    max_messages: int = Query(2000, ge=1, le=200000),
) -> dict:
    client = GraylogClient()
    if not client.is_configured():
        raise HTTPException(status_code=400, detail="Graylog no configurado")
    background.add_task(sync_graylog, query, range_seconds, max_messages)
    return {"status": "iniciado", "query": query, "range_seconds": range_seconds}


@router.get("/resumen")
def resumen(db: Session = Depends(get_db)) -> dict:
    def _count(*conditions) -> int:
        stmt = select(func.count()).select_from(ErrorFingerprint)
        for condition in conditions:
            stmt = stmt.where(condition)
        return int(db.execute(stmt).scalar_one())

    total = _count()
    ocurrencias = int(
        db.execute(
            select(func.coalesce(func.sum(ErrorFingerprint.occurrences_total), 0))
        ).scalar_one()
    )
    criticos = _count(
        ErrorFingerprint.severity.in_(("ERROR", "FATAL", "CRITICAL"))
    )
    aplicaciones = int(
        db.execute(
            select(func.count(func.distinct(ErrorFingerprint.application)))
        ).scalar_one()
    )

    def agrupar(columna, limite: int = 8):
        filas = db.execute(
            select(
                columna,
                func.count(),
                func.coalesce(func.sum(ErrorFingerprint.occurrences_total), 0),
            )
            .group_by(columna)
            .order_by(
                func.coalesce(func.sum(ErrorFingerprint.occurrences_total), 0).desc()
            )
            .limit(limite)
        ).all()
        return [
            {"nombre": nombre or "—", "total": int(total), "ocurrencias": int(ocurr)}
            for nombre, total, ocurr in filas
            if (nombre or "").strip()
        ]

    por_severidad = db.execute(
        select(ErrorFingerprint.severity, func.count())
        .group_by(ErrorFingerprint.severity)
        .order_by(func.count().desc())
    ).all()

    top = list(
        db.execute(
            select(ErrorFingerprint)
            .order_by(desc(ErrorFingerprint.occurrences_total))
            .limit(10)
        ).scalars()
    )

    return {
        "total": total,
        "ocurrencias": ocurrencias,
        "criticos": criticos,
        "aplicaciones": aplicaciones,
        "por_severidad": [
            {"nombre": (sev or "—"), "total": int(cantidad)}
            for sev, cantidad in por_severidad
        ],
        "por_aplicacion": agrupar(ErrorFingerprint.application),
        "por_servicio": agrupar(ErrorFingerprint.service),
        "top": [
            {
                "id": fp.id,
                "problema": fp.template or fp.exception_type or "—",
                "aplicacion": fp.application,
                "servicio": fp.service,
                "severidad": fp.severity,
                "ocurrencias": fp.occurrences_total,
            }
            for fp in top
        ],
    }


@router.get("/fingerprints")
def fingerprints(
    severidad: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(ErrorFingerprint).order_by(desc(ErrorFingerprint.last_seen))
    if severidad:
        stmt = stmt.where(ErrorFingerprint.severity == severidad)
    items = list(db.execute(stmt.limit(200)).scalars())
    return {
        "total": len(items),
        "items": [
            {
                "id": fp.id,
                "fingerprint": fp.fingerprint,
                "severidad": fp.severity,
                "exception_type": fp.exception_type,
                "aplicacion": fp.application,
                "servicio": fp.service,
                "ocurrencias": fp.occurrences_total,
                "primera": fp.first_seen,
                "ultima": fp.last_seen,
                "template": fp.template,
            }
            for fp in items
        ],
    }
