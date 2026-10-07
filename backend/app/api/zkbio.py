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


def _since(dias: int | None = None, horas: int | None = None) -> datetime:
    if horas:
        return datetime.now() - timedelta(hours=horas)
    return datetime.now() - timedelta(days=dias or 7)


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


@router.get("/no-registrados")
def no_registrados(
    dias: int = Query(7, ge=1, le=365),
    horas: int | None = Query(None, ge=1, le=8760),
    db: Session = Depends(get_db),
) -> dict:
    """Intentos de acceso de usuarios no registrados, agrupados por identidad:
    PIN > número de tarjeta > huella (sin ID)."""
    since = _since(dias, horas)
    rows = list(
        db.execute(
            select(ZkAccessRecord)
            .where(
                ZkAccessRecord.event_time >= since,
                ZkAccessRecord.event_name.ilike("%no registrado%"),
            )
            .order_by(desc(ZkAccessRecord.event_time))
        ).scalars()
    )

    grupos: dict[tuple, dict] = {}
    for r in rows:
        pin = (r.pin or "").strip()
        tarjeta = (r.card_no or "").strip()
        if pin:
            key = ("pin", pin)
        elif tarjeta:
            key = ("tarjeta", tarjeta)
        else:
            key = ("huella", "")

        g = grupos.get(key)
        if g is None:
            g = {
                "clave": f"{key[0]}:{key[1]}",
                "id": pin or tarjeta or None,
                "id_tipo": key[0],
                "pin": pin or None,
                "tarjeta": tarjeta or None,
                "total": 0,
                "primera": r.event_time,
                "ultima": r.event_time,
                "dispositivos": set(),
                "modos": set(),
                "areas": set(),
                "registros": [],
            }
            grupos[key] = g

        g["total"] += 1
        if r.event_time is not None:
            if g["primera"] is None or r.event_time < g["primera"]:
                g["primera"] = r.event_time
            if g["ultima"] is None or r.event_time > g["ultima"]:
                g["ultima"] = r.event_time
        if r.device_name:
            g["dispositivos"].add(r.device_name)
        if r.verify_mode:
            g["modos"].add(r.verify_mode)
        if r.area_name:
            g["areas"].add(r.area_name)

        if len(g["registros"]) < 2000:
            g["registros"].append(
                {
                    "fecha": r.event_time,
                    "tarjeta": tarjeta or None,
                    "pin": pin or None,
                    "dispositivo": r.device_name,
                    "area": r.area_name,
                    "lector": r.reader_name,
                    "modo": r.verify_mode,
                }
            )

    salida = sorted(grupos.values(), key=lambda x: -x["total"])
    for g in salida:
        g["dispositivos"] = sorted(g["dispositivos"])
        g["modos"] = sorted(g["modos"])
        g["areas"] = sorted(g["areas"])
    return {"total": len(rows), "grupos": salida}


@router.get("/records")
def records(
    dias: int = Query(7, ge=1, le=365),
    horas: int | None = Query(None, ge=1, le=8760),
    dispositivo: str | None = None,
    area: str | None = None,
    evento: str | None = None,
    usuario: str | None = None,
    tarjeta: str | None = None,
    pin: str | None = None,
    excluir_no_registrados: bool = False,
    limit: int = Query(300, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(ZkAccessRecord).where(ZkAccessRecord.event_time >= _since(dias, horas))
    if excluir_no_registrados:
        stmt = stmt.where(~ZkAccessRecord.event_name.ilike("%no registrado%"))
    if tarjeta:
        stmt = stmt.where(ZkAccessRecord.card_no == tarjeta)
    if pin:
        stmt = stmt.where(ZkAccessRecord.pin == pin)
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
def resumen(
    dias: int = Query(7, ge=1, le=365),
    horas: int | None = Query(None, ge=1, le=8760),
    db: Session = Depends(get_db),
) -> dict:
    since = _since(dias, horas)
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


@router.get("/usuarios")
def usuarios(
    dias: int = Query(7, ge=1, le=365),
    horas: int | None = Query(None, ge=1, le=8760),
    db: Session = Depends(get_db),
) -> dict:
    """Usuarios registrados (con nombre/PIN) y sus accesos en el período."""
    since = _since(dias, horas)
    filas = db.execute(
        select(
            ZkAccessRecord.pin,
            func.max(ZkAccessRecord.first_name).label("nombre"),
            func.max(ZkAccessRecord.last_name).label("apellido"),
            func.count().label("total"),
            func.max(ZkAccessRecord.event_time).label("ultima"),
        )
        .where(
            ZkAccessRecord.event_time >= since,
            ZkAccessRecord.pin.isnot(None),
            ZkAccessRecord.pin != "",
            ZkAccessRecord.first_name.isnot(None),
            ~ZkAccessRecord.event_name.ilike("%no registrado%"),
        )
        .group_by(ZkAccessRecord.pin)
        .order_by(func.count().desc())
    ).all()
    return {
        "total": len(filas),
        "items": [
            {
                "pin": pin,
                "nombre": " ".join(p for p in (nombre, apellido) if p) or f"ID {pin}",
                "total": int(total),
                "ultima": ultima,
            }
            for pin, nombre, apellido, total, ultima in filas
        ],
    }


@router.get("/usuario/{pin}")
def usuario_historial(
    pin: str,
    dias: int = Query(7, ge=1, le=365),
    horas: int | None = Query(None, ge=1, le=8760),
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> dict:
    """Histórico completo de un usuario registrado (por su PIN/ID)."""
    since = _since(dias, horas)
    items = list(
        db.execute(
            select(ZkAccessRecord)
            .where(
                ZkAccessRecord.pin == pin,
                ZkAccessRecord.event_time >= since,
            )
            .order_by(desc(ZkAccessRecord.event_time))
            .limit(limit)
        ).scalars()
    )
    nombre = next((_nombre(r) for r in items if r.first_name), f"ID {pin}")
    return {
        "pin": pin,
        "nombre": nombre,
        "total": len(items),
        "registros": [
            {
                "fecha": r.event_time,
                "evento": r.event_name,
                "dispositivo": r.device_name,
                "area": r.area_name,
                "lector": r.reader_name,
                "modo": r.verify_mode,
                "tarjeta": r.card_no,
            }
            for r in items
        ],
    }
