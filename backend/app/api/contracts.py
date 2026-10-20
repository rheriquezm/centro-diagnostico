from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import contract_service

router = APIRouter(
    prefix="/contracts",
    tags=["contracts"],
    dependencies=[Depends(get_current_user)],
)


class ChatRequest(BaseModel):
    question: str
    provider: str | None = None


class SlaIn(BaseModel):
    slas: list[dict]


def _sla_meta(e) -> dict:
    return {
        "id": e.id,
        "orden": e.orden,
        "criticidad": e.criticidad,
        "descripcion": e.descripcion,
        "tiempo_respuesta": e.tiempo_respuesta,
        "tiempo_resolucion": e.tiempo_resolucion,
        "penalidad": e.penalidad,
        "nota": e.nota,
    }


def _meta(doc) -> dict:
    return {
        "id": doc.id,
        "name": doc.name,
        "chars": doc.chars,
        "uploaded_at": doc.uploaded_at,
    }


@router.get("")
def list_documents(db: Session = Depends(get_db)) -> dict:
    return {"documents": [_meta(d) for d in contract_service.list_documents(db)]}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), db: Session = Depends(get_db)
) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    try:
        text = contract_service.extract_text(file.filename or "", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip():
        raise HTTPException(
            status_code=400, detail="No se pudo extraer texto del documento"
        )
    doc = contract_service.save_document(db, file.filename or "documento", text)
    return {"document": _meta(doc)}


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)) -> dict:
    if not contract_service.delete_document(db, doc_id):
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"status": "eliminado", "id": doc_id}


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db)) -> dict:
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Pregunta vacia")
    result = contract_service.answer_question(db, payload.question, payload.provider)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/slas")
def get_slas(db: Session = Depends(get_db)) -> dict:
    contract_service._asegurar_slas(db)
    return {"slas": [_sla_meta(e) for e in contract_service.list_slas(db)]}


@router.get("/slas/texto")
def get_slas_texto(db: Session = Depends(get_db)) -> dict:
    return {"secciones": contract_service.sla_sections(db)}


@router.put("/slas")
def set_slas(payload: SlaIn, db: Session = Depends(get_db)) -> dict:
    return {
        "slas": [_sla_meta(e) for e in contract_service.save_slas(db, payload.slas)]
    }


@router.post("/slas/extraer")
def extraer_slas(
    provider: str | None = None, db: Session = Depends(get_db)
) -> dict:
    return contract_service.extraer_slas(db, provider)


@router.get("/sla-cumplimiento")
def sla_cumplimiento(limite: int = 300, db: Session = Depends(get_db)) -> dict:
    return contract_service.sla_cumplimiento(db, limite)


@router.get("/sla-detalle/{ticket_id}")
def sla_detalle(ticket_id: int, db: Session = Depends(get_db)) -> dict:
    result = contract_service.sla_detalle(db, ticket_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return result


@router.post("/analyze-ticket/{ticket_id}")
def analyze_ticket(
    ticket_id: int,
    provider: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    result = contract_service.analyze_ticket(db, ticket_id, provider)
    if result is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
