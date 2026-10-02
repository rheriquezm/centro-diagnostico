from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.connectors.zkbio import ZkbioClient, ZkbioError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ZkAccessRecord
from app.services.zkbio_sync import sync_zkbio

router = APIRouter(
    prefix="/zkbio",
    tags=["zkbio"],
    dependencies=[Depends(get_current_user)],
)

EVENTO_APERTURA = "Apertura"
EVENTOS_DENEGADO = ("no registrado", "denegad", "rechaz", "denied", "ilegal", "caduc")


def _since(dias: int) -> datetime:
    return datetime.now() - timedelta(days=dias)


def _nombre(record: ZkAccessRecord) -> str:
    partes = [p for p in (record.first_name, record.last_name) if p]
    if partes:
        return " ".join(partes)
    if record.pin:
        return f"ID {record.pin}"
    return "—"


@router.get("/test")
def test_connection(
    username: str | None = None,
    password: str | None = None,
) -> dict:
    try:
        client = ZkbioClient(username=username, password=password)
        return client.test()
    except ZkbioError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync(
    background: BackgroundTasks,
    days: int = Query(7, ge=1, le=365),
) -> dict:
    client = ZkbioClient()
    if not client.is_configured():
        raise HTTPException(
            status_code=400,
            detail="ZKBio no configurado (ZKBIO_USERNAME/ZKBIO_PASSWORD)",
        )
    background.add_task(sync_zkbio, days)
    return {"status": "iniciado", "days": days}


@router.get("/records")
def records(
    dias: int = Query(7, ge=1, le=365),
    dispositivo: str | None = None,
    area: str | None = None,
    evento: str | None = None,
    usuario: str | None = None,
    limit: int = Query(300, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(ZkAccessRecord).where(ZkAccessRecord.event_time >= _since(dias))
    if dispositivo:
        stmt = stmt.where(ZkAccessRecord.device_name.ilike(f"%{dispositivo}%"))
    if area:
        stmt = stmt.where(ZkAccessRecord.area_name.ilike(f"%{area}%"))
    if evento:
        stmt = stmt.where(ZkAccessRecord.event_name.ilike(f"%{evento}%"))
    if usuario:
        patron = f"%{usuario}%"
        stmt = stmt.where(
            or_(
                ZkAccessRecord.first_name.ilike(patron),
                ZkAccessRecord.last_name.ilike(patron),
                ZkAccessRecord.pin.ilike(patron),
                ZkAccessRecord.card_no.ilike(patron),
            )
        )
    items = list(
        db.execute(
            stmt.order_by(desc(ZkAccessRecord.event_time)).limit(limit)
        ).scalars()
    )
    return {
        "total": len(items),
        "items": [
            {
                "id": r.id,
                "fecha": r.event_time,
                "dispositivo": r.device_name,
                "area": r.area_name,
                "evento": r.event_name,
                "usuario": _nombre(r),
                "pin": r.pin,
                "tarjeta": r.card_no,
                "modo": r.verify_mode,
                "lector": r.reader_name,
            }
            for r in items
        ],
    }


@router.get("/resumen")
def resumen(dias: int = Query(7, ge=1, le=365), db: Session = Depends(get_db)) -> dict:
    since = _since(dias)
    base = select(ZkAccessRecord).where(ZkAccessRecord.event_time >= since)
    base_sub = base.subquery()

    total = int(
        db.execute(select(func.count()).select_from(base_sub)).scalar_one()
    )
    aperturas = int(
        db.execute(
            select(func.count()).select_from(
                base.where(
                    ZkAccessRecord.event_name.ilike(f"%{EVENTO_APERTURA}%")
                ).subquery()
            )
        ).scalar_one()
    )
    denegados = int(
        db.execute(
            select(func.count()).select_from(
                base.where(
                    or_(
                        *[
                            ZkAccessRecord.event_name.ilike(f"%{token}%")
                            for token in EVENTOS_DENEGADO
                        ]
                    )
                ).subquery()
            )
        ).scalar_one()
    )

    def agrupar(columna, excluir_vacios: bool = True, limite: int = 10):
        filas = db.execute(
            select(columna, func.count())
            .where(ZkAccessRecord.event_time >= since)
            .group_by(columna)
            .order_by(func.count().desc())
            .limit(limite)
        ).all()
        resultado = []
        for nombre, cantidad in filas:
            nombre = nombre or "—"
            if excluir_vacios and nombre in ("—", ""):
                continue
            resultado.append({"nombre": nombre, "total": int(cantidad)})
        return resultado

    usuarios = db.execute(
        select(
            ZkAccessRecord.first_name,
            ZkAccessRecord.last_name,
            func.count(),
        )
        .where(
            ZkAccessRecord.event_time >= since,
            ZkAccessRecord.event_name.ilike(f"%{EVENTO_APERTURA}%"),
            ZkAccessRecord.first_name.isnot(None),
        )
        .group_by(ZkAccessRecord.first_name, ZkAccessRecord.last_name)
        .order_by(func.count().desc())
        .limit(15)
    ).all()

    por_hora = db.execute(
        select(
            func.extract("hour", ZkAccessRecord.event_time).label("h"),
            func.count(),
        )
        .where(
            ZkAccessRecord.event_time >= since,
            ZkAccessRecord.event_name.ilike(f"%{EVENTO_APERTURA}%"),
        )
        .group_by("h")
        .order_by("h")
    ).all()

    return {
        "dias": dias,
        "total": total,
        "aperturas": aperturas,
        "denegados": denegados,
        "por_evento": agrupar(ZkAccessRecord.event_name, limite=10),
        "por_dispositivo": agrupar(ZkAccessRecord.device_name, limite=10),
        "por_area": agrupar(ZkAccessRecord.area_name, limite=10),
        "por_usuario": [
            {
                "nombre": " ".join(p for p in (nombre, apellido) if p),
                "total": int(cantidad),
            }
            for nombre, apellido, cantidad in usuarios
        ],
        "por_hora": [{"hora": int(h), "total": int(cantidad)} for h, cantidad in por_hora],
    }
