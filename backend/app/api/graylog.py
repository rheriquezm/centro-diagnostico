from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.connectors.graylog import GraylogClient, GraylogError
from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ErrorBucket, ErrorFingerprint
from app.services.ai.runner import structured
from app.services.graylog_sync import sync_graylog

router = APIRouter(
    prefix="/graylog",
    tags=["graylog"],
    dependencies=[Depends(get_current_user)],
)


def _hosts_map(db: Session, ids: list[int]) -> dict[int, list[dict]]:
    """Maquinas/servidores donde ocurre cada fingerprint (desde los buckets)."""
    if not ids:
        return {}
    filas = db.execute(
        select(
            ErrorBucket.fingerprint_id,
            ErrorBucket.host,
            func.sum(ErrorBucket.count),
        )
        .where(ErrorBucket.fingerprint_id.in_(ids))
        .group_by(ErrorBucket.fingerprint_id, ErrorBucket.host)
        .order_by(func.sum(ErrorBucket.count).desc())
    ).all()
    mapa: dict[int, list[dict]] = {}
    for fp_id, host, total in filas:
        if not host:
            continue
        mapa.setdefault(fp_id, []).append({"host": host, "total": int(total)})
    return mapa


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
    hosts_map = _hosts_map(db, [fp.id for fp in top])

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
                "hosts": hosts_map.get(fp.id, []),
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
    hosts_map = _hosts_map(db, [fp.id for fp in items])
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
                "hosts": hosts_map.get(fp.id, []),
            }
            for fp in items
        ],
    }


def _parse_dt(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/rango")
def rango(
    desde: str | None = None,
    hasta: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Problemas (fingerprints) ocurridos dentro de un rango de fecha/hora."""
    d = _parse_dt(desde)
    h = _parse_dt(hasta)
    cond = []
    if d:
        cond.append(ErrorBucket.bucket_hour >= d)
    if h:
        cond.append(ErrorBucket.bucket_hour <= h)

    filas = db.execute(
        select(
            ErrorBucket.fingerprint_id,
            func.sum(ErrorBucket.count),
            func.min(ErrorBucket.bucket_hour),
            func.max(ErrorBucket.bucket_hour),
        )
        .where(*cond)
        .group_by(ErrorBucket.fingerprint_id)
        .order_by(func.sum(ErrorBucket.count).desc())
    ).all()

    ids = [fp_id for fp_id, *_ in filas]
    fps = {}
    if ids:
        fps = {
            fp.id: fp
            for fp in db.execute(
                select(ErrorFingerprint).where(ErrorFingerprint.id.in_(ids))
            ).scalars()
        }
    hosts_map: dict[int, list] = {}
    if ids:
        for fp_id, host, total in db.execute(
            select(
                ErrorBucket.fingerprint_id,
                ErrorBucket.host,
                func.sum(ErrorBucket.count),
            )
            .where(*cond, ErrorBucket.fingerprint_id.in_(ids))
            .group_by(ErrorBucket.fingerprint_id, ErrorBucket.host)
            .order_by(func.sum(ErrorBucket.count).desc())
        ).all():
            if host:
                hosts_map.setdefault(fp_id, []).append(
                    {"host": host, "total": int(total)}
                )

    items = []
    for fp_id, total, primera, ultima in filas:
        fp = fps.get(fp_id)
        if fp is None:
            continue
        items.append(
            {
                "id": fp.id,
                "problema": fp.template or fp.exception_type or "—",
                "severidad": fp.severity,
                "aplicacion": fp.application,
                "servicio": fp.service,
                "ocurrencias": int(total),
                "primera": primera,
                "ultima": ultima,
                "hosts": hosts_map.get(fp_id, []),
            }
        )

    por_severidad: dict[str, int] = {}
    por_host: dict[str, int] = {}
    for it in items:
        sev = it["severidad"] or "—"
        por_severidad[sev] = por_severidad.get(sev, 0) + it["ocurrencias"]
        for hh in it["hosts"]:
            por_host[hh["host"]] = por_host.get(hh["host"], 0) + hh["total"]

    return {
        "desde": desde,
        "hasta": hasta,
        "total_fingerprints": len(items),
        "ocurrencias": sum(it["ocurrencias"] for it in items),
        "items": items,
        "por_severidad": sorted(
            ({"nombre": k, "total": v} for k, v in por_severidad.items()),
            key=lambda x: -x["total"],
        ),
        "por_host": sorted(
            ({"nombre": k, "total": v} for k, v in por_host.items()),
            key=lambda x: -x["total"],
        ),
    }


class ConsultaRequest(BaseModel):
    pregunta: str
    desde: str | None = None
    hasta: str | None = None
    provider: str | None = None


SYSTEM_SEGURIDAD = (
    "Eres un analista de seguridad (AppSec/SRE). Con base en los eventos de Graylog "
    "del rango indicado, responde la pregunta del usuario y detecta posibles "
    "VULNERABILIDADES o riesgos. Cita aplicaciones/hosts y el tipo de evento. Si algo "
    "no esta en los datos, dilo y no lo inventes. Responde en espanol, claro y conciso. "
    "Devuelve UNICAMENTE JSON con las claves: respuesta (texto), "
    "vulnerabilidades (lista de {titulo, riesgo, evidencia, recomendacion}), "
    "recomendaciones (lista de textos), confianza (0-1)."
)


def _fallback_seguridad(data: dict, pregunta: str) -> dict:
    """Analisis de seguridad deterministico (sin IA) sobre los datos del rango."""
    items = data["items"]
    sev = ", ".join(f"{k}: {v}" for k, v in (
        (s["nombre"], s["total"]) for s in data["por_severidad"]
    ))
    hosts = ", ".join(f"{h['nombre']} ({h['total']})" for h in data["por_host"])
    claves = (
        "selinux", "denied", "permission", "auth", "login", "sudo", "ssh",
        "password", "credencial", "firewall", "iptables", "malware", "exploit",
        "vulnerab", "cve", "injection", "xss", "deserial", "privileg", "chkpwd",
    )
    vulnerabilidades = []
    for it in items[:50]:
        texto = (it["problema"] or "").lower()
        if any(c in texto for c in claves):
            vulnerabilidades.append(
                {
                    "titulo": it["problema"][:160],
                    "riesgo": "Medio",
                    "evidencia": f"{it['ocurrencias']} ocurrencias en "
                    f"{(', '.join(h['host'] for h in it['hosts']) or 'n/d')}",
                    "recomendacion": "Revisar la configuración/política asociada y "
                    "aplicar el endurecimiento (hardening) correspondiente.",
                }
            )
        if len(vulnerabilidades) >= 8:
            break

    recomendaciones = [
        "Revisar los eventos SELinux y ajustar políticas (audit2allow/semodule).",
        "Verificar intentos de autenticación fallidos y accesos denegados.",
        "Actualizar componentes con CVE conocidos.",
        "Revisar reglas de firewall y puertos expuestos.",
    ]
    riesgo_txt = (
        "Se detectaron posibles riesgos relacionados con: "
        + "; ".join(v["titulo"] for v in vulnerabilidades[:5])
        if vulnerabilidades
        else "No se detectaron patrones claramente de seguridad; revisa primero los "
        "problemas de mayor severidad."
    )
    respuesta = (
        "**Análisis de seguridad (respaldo sin IA)**\n\n"
        f"- Rango: {data.get('desde') or 'inicio'} a {data.get('hasta') or 'ahora'}\n"
        f"- Eventos: {data['ocurrencias']} en {data['total_fingerprints']} tipos.\n"
        f"- Severidad: {sev or '—'}\n"
        f"- Hosts: {hosts or '—'}\n\n"
        + riesgo_txt
    )
    return {
        "respuesta": respuesta,
        "vulnerabilidades": vulnerabilidades,
        "recomendaciones": recomendaciones,
    }


@router.post("/consultar")
def consultar(payload: ConsultaRequest, db: Session = Depends(get_db)) -> dict:
    data = rango(payload.desde, payload.hasta, db)
    import json as _json

    top = data["items"][:25]
    contexto = {
        "rango": {"desde": payload.desde, "hasta": payload.hasta},
        "total_fingerprints": data["total_fingerprints"],
        "ocurrencias": data["ocurrencias"],
        "por_severidad": data["por_severidad"],
        "por_host": data["por_host"],
        "top_problemas": [
            {
                "problema": t["problema"][:200],
                "severidad": t["severidad"],
                "aplicacion": t["aplicacion"],
                "ocurrencias": t["ocurrencias"],
                "hosts": [h["host"] for h in t["hosts"]],
            }
            for t in top
        ],
    }
    user = (
        "DATOS DE GRAYLOG:\n"
        + _json.dumps(contexto, ensure_ascii=False)
        + "\n\nPREGUNTA:\n"
        + payload.pregunta
    )
    result, used = structured(SYSTEM_SEGURIDAD, user, user, payload.provider)

    def _lista(val):
        return val if isinstance(val, list) else []

    respuesta = result.get("respuesta") or result.get("answer") or ""
    vulnerabilidades = _lista(result.get("vulnerabilidades"))
    recomendaciones = _lista(result.get("recomendaciones"))
    if not respuesta:
        fb = _fallback_seguridad(data, payload.pregunta)
        respuesta = fb["respuesta"]
        vulnerabilidades = fb["vulnerabilidades"]
        recomendaciones = fb["recomendaciones"]
        used = "respaldo (sin IA)"

    return {
        "pregunta": payload.pregunta,
        "respuesta": respuesta,
        "vulnerabilidades": vulnerabilidades,
        "recomendaciones": recomendaciones,
        "confianza": result.get("confianza"),
        "provider": used,
        "resumen": {
            "total_fingerprints": data["total_fingerprints"],
            "ocurrencias": data["ocurrencias"],
            "por_severidad": data["por_severidad"],
        },
    }
