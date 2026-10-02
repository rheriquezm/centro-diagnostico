from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import ai_service

router = APIRouter(tags=["ai"], dependencies=[Depends(get_current_user)])


class DiagnoseRequest(BaseModel):
    fingerprint_id: int


class AskRequest(BaseModel):
    question: str


@router.post("/ai/diagnose")
def diagnose(payload: DiagnoseRequest, db: Session = Depends(get_db)) -> dict:
    result = ai_service.diagnose(db, payload.fingerprint_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Problema no encontrado")
    return result


@router.post("/assistant/ask")
def ask(payload: AskRequest, db: Session = Depends(get_db)) -> dict:
    return ai_service.assistant(db, payload.question)
