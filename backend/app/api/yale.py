from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.connectors.yale import YaleClient, YaleError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import YaleAccessRecord
from app.services.yale_sync import sync_yale

router = APIRouter(
    prefix="/yale",
    tags=["yale"],
    dependencies=[Depends(get_current_user)],
)

APERTURA = "Desbloqueada"
CIERRE = "Bloqueada"


@router.get("/test")
def test_connection() -> dict:
    try:
        client = YaleClient()
        data = client.login()
        homes = (data.get("accountData") or {}).get("homeList", [])
        return {
            "homes": [
                {"id": h.get("homeId"), "description": h.get("description")}
                for h in homes
            ]
        }
    except YaleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/devices")
def devices() -> dict:
    """Dispositivos del hogar Yale (candados + gateway) con estado de batería.

    El API expone `lowBattery` (alerta de batería), no un porcentaje.
    """
    try:
        client = YaleClient()
        data = client.login()
        homes = (data.get("accountData") or {}).get("homeList", [])
        lista: list[dict] = []
        for home in homes:
            for device in home.get("deviceList") or []:
                params = device.get("deviceParameters") or {}
                firmware = (device.get("currentFirmwareVersion") or "").strip()
                lista.append(
                    {
                        "device_id": device.get("deviceId"),
                        "description": device.get("description"),
                        "category": device.get("category"),
                        "model": device.get("deviceModelDescription"),
                        "online": bool(device.get("isOnline")),
                        "low_battery": bool(
                            device.get("lowBattery") or params.get("lowBattery")
                        ),
                        "state": device.get("state"),
                        "firmware": firmware or None,
                        "home": home.get("description"),
                    }
                )
        return {"devices": lista}
    except YaleError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/sync")
def sync(
    background: BackgroundTasks,
    days: int = Query(7, ge=1, le=60),
) -> dict:
    client = YaleClient()
    if not client.is_configured():
        raise HTTPException(
            status_code=400, detail="Yale no configurado (YALE_EMAIL/YALE_PASSWORD)"
        )
    background.add_task(sync_yale, days)
    return {"status": "iniciado", "days": days}


def _since(dias: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=dias)


@router.get("/records")
def records(
    dias: int = Query(7, ge=1, le=90),
    puerta: str | None = None,
    usuario: str | None = None,
    estado: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(YaleAccessRecord).where(
        YaleAccessRecord.operation_datetime >= _since(dias)
    )
    if puerta:
        stmt = stmt.where(YaleAccessRecord.device_description == puerta)
    if usuario:
        stmt = stmt.where(YaleAccessRecord.user_name.ilike(f"%{usuario}%"))
    if estado:
        stmt = stmt.where(YaleAccessRecord.status_name == estado)
    items = list(
        db.execute(
            stmt.order_by(desc(YaleAccessRecord.operation_datetime)).limit(limit)
        ).scalars()
    )
    return {
        "total": len(items),
        "items": [
            {
                "id": r.id,
                "puerta": r.device_description,
                "categoria": r.category,
                "fecha": r.operation_datetime,
                "estado": r.status_name,
                "origen": r.source_name,
                "motivo": r.reason_name,
                "usuario": r.user_name or "—",
            }
            for r in items
        ],
    }


@router.get("/resumen")
def resumen(dias: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)) -> dict:
    since = _since(dias)
    base = select(YaleAccessRecord).where(YaleAccessRecord.operation_datetime >= since)

    total = int(
        db.execute(
            select(func.count()).select_from(base.subquery())
        ).scalar_one()
    )
    aperturas = int(
        db.execute(
            select(func.count()).select_from(
                base.where(YaleAccessRecord.status_name == APERTURA).subquery()
            )
        ).scalar_one()
    )
    cierres = int(
        db.execute(
            select(func.count()).select_from(
                base.where(YaleAccessRecord.status_name == CIERRE).subquery()
            )
        ).scalar_one()
    )

    def agrupar(columna, excluir_vacios=True):
        stmt = (
            select(columna, func.count())
            .where(YaleAccessRecord.operation_datetime >= since)
            .group_by(columna)
            .order_by(func.count().desc())
        )
        rows = db.execute(stmt).all()
        resultado = []
        for nombre, cantidad in rows:
            nombre = nombre or "—"
            if excluir_vacios and nombre in ("—", ""):
                continue
            resultado.append({"nombre": nombre, "total": int(cantidad)})
        return resultado

    # Aperturas por usuario (solo desbloqueos con usuario)
    usuarios = list(
        db.execute(
            select(YaleAccessRecord.user_name, func.count())
            .where(
                YaleAccessRecord.operation_datetime >= since,
                YaleAccessRecord.status_name == APERTURA,
                YaleAccessRecord.user_name != "",
            )
            .group_by(YaleAccessRecord.user_name)
            .order_by(func.count().desc())
            .limit(15)
        ).all()
    )

    por_hora = list(
        db.execute(
            select(
                func.extract("hour", YaleAccessRecord.operation_datetime).label("h"),
                func.count(),
            )
            .where(
                YaleAccessRecord.operation_datetime >= since,
                YaleAccessRecord.status_name == APERTURA,
            )
            .group_by("h")
            .order_by("h")
        ).all()
    )

    return {
        "dias": dias,
        "total": total,
        "aperturas": aperturas,
        "cierres": cierres,
        "por_usuario": [
            {"nombre": nombre, "total": int(cantidad)} for nombre, cantidad in usuarios
        ],
        "por_puerta": agrupar(YaleAccessRecord.device_description),
        "por_hora": [
            {"hora": int(h), "total": int(cantidad)} for h, cantidad in por_hora
        ],
    }
