from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.services import ai_service
from app.services.ai.factory import (
    anthropic_configured,
    gemini_configured,
    openai_configured,
)

router = APIRouter(tags=["ai"], dependencies=[Depends(get_current_user)])


class DiagnoseRequest(BaseModel):
    fingerprint_id: int
    provider: str | None = None


class DiagnoseTicketRequest(BaseModel):
    ticket_id: int
    provider: str | None = None


class AskRequest(BaseModel):
    question: str
    provider: str | None = None


@router.get("/ai/providers")
def providers() -> dict:
    """Proveedores de IA disponibles para que el usuario elija."""
    return {
        "default": (settings.AI_PROVIDER or "none").lower(),
        "providers": [
            {
                "id": "gemini",
                "label": "Gemini (Google)",
                "model": settings.GEMINI_MODEL or "gemini-3.5-flash",
                "available": gemini_configured(),
            },
            {
                "id": "openai",
                "label": "ChatGPT (OpenAI)",
                "model": settings.OPENAI_MODEL or "gpt-4o-mini",
                "available": openai_configured(),
            },
            {
                "id": "claude",
                "label": "Claude (Anthropic)",
                "model": settings.ANTHROPIC_MODEL or "claude-3-5-sonnet-latest",
                "available": anthropic_configured(),
            },
            {
                "id": "ollama",
                "label": "Local (Ollama)",
                "model": settings.AI_MODEL or "llama3.2:1b",
                "available": True,
            },
        ],
    }


@router.post("/ai/diagnose")
def diagnose(payload: DiagnoseRequest, db: Session = Depends(get_db)) -> dict:
    result = ai_service.diagnose(db, payload.fingerprint_id, payload.provider)
    if result is None:
        raise HTTPException(status_code=404, detail="Problema no encontrado")
    return result


@router.post("/ai/diagnose-ticket")
def diagnose_ticket(
    payload: DiagnoseTicketRequest, db: Session = Depends(get_db)
) -> dict:
    result = ai_service.diagnose_ticket(db, payload.ticket_id, payload.provider)
    if result is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return result


@router.post("/assistant/ask")
def ask(payload: AskRequest, db: Session = Depends(get_db)) -> dict:
    return ai_service.assistant(db, payload.question, payload.provider)
