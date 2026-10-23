import time

from fastapi import APIRouter, Depends, HTTPException

from app.connectors.nagios import NagiosClient, NagiosError
from app.core.security import get_current_user

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
