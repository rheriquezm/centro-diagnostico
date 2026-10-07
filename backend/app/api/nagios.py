from fastapi import APIRouter, Depends, HTTPException

from app.connectors.nagios import NagiosClient, NagiosError
from app.core.security import get_current_user

router = APIRouter(
    prefix="/nagios",
    tags=["nagios"],
    dependencies=[Depends(get_current_user)],
)


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
