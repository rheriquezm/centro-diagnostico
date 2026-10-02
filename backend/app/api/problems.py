from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import problems

router = APIRouter(
    prefix="/problems",
    tags=["problems"],
    dependencies=[Depends(get_current_user)],
)


@router.get("")
def list_problems(
    aplicacion: str | None = None,
    servicio: str | None = None,
    severidad: str | None = None,
    con_ticket: bool | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    return problems.list_problems(
        db, aplicacion=aplicacion, servicio=servicio, severidad=severidad, con_ticket=con_ticket, q=q
    )


@router.get("/{fingerprint_id}")
def problem_detail(fingerprint_id: int, db: Session = Depends(get_db)) -> dict:
    detail = problems.problem_detail(db, fingerprint_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Problema no encontrado")
    return detail
