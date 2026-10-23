import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.connectors.nagios import NagiosClient, NagiosError
from app.core.security import get_current_user
from app.services.ai.runner import structured

router = APIRouter(
    prefix="/nagios",
    tags=["nagios"],
    dependencies=[Depends(get_current_user)],
)

_TOPO: dict = {"data": None, "ts": 0.0}
_TOPO_TTL = 300
_METR: dict = {"data": None, "ts": 0.0}
_METR_TTL = 60


@router.get("/test")
def test_connection() -> dict:
    try:
        return NagiosClient().test()
    except NagiosError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/summary")
def summary() -> dict:
    """Hosts, servicios y alertas en vivo desde Nagios."""
    try:
        return NagiosClient().resumen()
    except NagiosError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/metricas")
def metricas(refresh: bool = False) -> dict:
    """Metricas de consumo (memoria, CPU, disco, swap) + treemap. Cache 60s."""
    now = time.time()
    if (
        not refresh
        and _METR["data"] is not None
        and now - _METR["ts"] < _METR_TTL
    ):
        return _METR["data"]
    try:
        data = NagiosClient().metricas()
        _METR["data"] = data
        _METR["ts"] = now
        return data
    except NagiosError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/topologia")
def topologia(refresh: bool = False) -> dict:
    """Grafo de conexiones (hosts y su orden de flujo). Cacheado 5 min."""
    now = time.time()
    if (
        not refresh
        and _TOPO["data"] is not None
        and now - _TOPO["ts"] < _TOPO_TTL
    ):
        return _TOPO["data"]
    try:
        data = NagiosClient().topologia()
        _TOPO["data"] = data
        _TOPO["ts"] = now
        return data
    except NagiosError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class AnalisisReq(BaseModel):
    host: str
    servicio: str
    estado: str | None = None
    salida: str | None = None


SYSTEM_SERVICIO = (
    "Eres un experto en monitoreo de sistemas (Nagios). Explica en lenguaje SIMPLE y breve "
    "(para alguien no tecnico) que significa el estado de este servicio, que riesgo implica y "
    "que accion concreta recomiendas. Responde UNICAMENTE JSON con las claves: "
    "analisis (texto simple, max 80 palabras), recomendacion (texto, max 40 palabras), "
    "severidad ('ok'|'bajo'|'medio'|'alto')."
)


def _analisis_determinista(host, servicio, estado, salida):
    estado_u = (estado or "").upper()
    if estado_u in ("OK", "UP"):
        return (
            "El servicio responde correctamente y opera dentro de los parametros esperados.",
            "Sin accion requerida; continuar el monitoreo.",
            "ok",
        )
    texto = f"{servicio} {salida}".lower()
    rec = "Revisar el detalle del servicio y el log del host."
    if "disk" in texto or "filesystem" in texto or "space" in texto:
        causa = "Se detecta una condicion en el espacio en disco de un filesystem."
        rec = "Liberar espacio, revisar crecimiento de logs y ampliar el disco si es necesario."
    elif "memor" in texto or "memory" in texto or "swap" in texto:
        causa = "Se detecta un consumo elevado de memoria."
        rec = "Revisar procesos que consumen mas memoria y considerar ampliar recursos."
    elif "cpu" in texto or "load" in texto:
        causa = "Se detecta una carga elevada de CPU."
        rec = "Identificar procesos con alto consumo y revisar la capacidad del servidor."
    elif "http" in texto or "apache" in texto or "nginx" in texto:
        causa = "El servicio web presenta problemas de respuesta."
        rec = "Revisar el estado de Apache/HTTP, errores 5xx y logs del servidor web."
    elif "ping" in texto or "ssh" in texto or "connect" in texto:
        causa = "Se detectan problemas de conectividad con el host."
        rec = "Verificar red, firewall y disponibilidad del host."
    elif "selinux" in texto:
        causa = "SELinux esta bloqueando una operacion del servicio."
        rec = "Revisar la politica SELinux (audit2allow/semodule) y ajustarla."
    else:
        causa = f"El servicio reporta estado {estado_u or 'desconocido'}."
    severidad = "alto" if estado_u == "CRITICAL" else "medio"
    return (causa, rec, severidad)


@router.post("/analizar")
def analizar(payload: AnalisisReq) -> dict:
    estado_u = (payload.estado or "").upper()
    if estado_u in ("OK", "UP"):
        analisis, recomendacion, severidad = _analisis_determinista(
            payload.host, payload.servicio, payload.estado, payload.salida
        )
        return {
            "host": payload.host,
            "servicio": payload.servicio,
            "estado": payload.estado,
            "salida": payload.salida,
            "analisis": analisis,
            "recomendacion": recomendacion,
            "severidad": severidad,
            "provider": "regla",
        }

    user = (
        f"Host: {payload.host}\nServicio: {payload.servicio}\n"
        f"Estado: {payload.estado}\nSalida: {payload.salida}"
    )
    result, used = structured(SYSTEM_SERVICIO, user, user, None)
    analisis = result.get("analisis") or ""
    recomendacion = result.get("recomendacion") or ""
    severidad = result.get("severidad") or ""
    if not analisis:
        a, r, s = _analisis_determinista(
            payload.host, payload.servicio, payload.estado, payload.salida
        )
        analisis, recomendacion, severidad, used = a, r, s, "respaldo (sin IA)"
    return {
        "host": payload.host,
        "servicio": payload.servicio,
        "estado": payload.estado,
        "salida": payload.salida,
        "analisis": analisis,
        "recomendacion": recomendacion,
        "severidad": severidad,
        "provider": used,
    }
