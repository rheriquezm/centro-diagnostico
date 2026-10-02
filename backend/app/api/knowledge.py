from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import KbEntry

router = APIRouter(
    prefix="/knowledge",
    tags=["knowledge"],
    dependencies=[Depends(get_current_user)],
)


class KbCreate(BaseModel):
    fingerprint: str
    problem: str | None = None
    cause: str | None = None
    solution: str | None = None
    ticket_redmine_id: int | None = None
    verified: bool = False
    evidence: str | None = None


def _out(entry: KbEntry) -> dict:
    return {
        "id": entry.id,
        "fingerprint": entry.fingerprint,
        "problem": entry.problem,
        "cause": entry.cause,
        "solution": entry.solution,
        "ticket_redmine_id": entry.ticket_redmine_id,
        "verified": entry.verified,
        "evidence": entry.evidence,
        "created_at": entry.created_at,
    }


@router.get("")
def list_entries(db: Session = Depends(get_db)) -> dict:
    entries = list(
        db.execute(select(KbEntry).order_by(desc(KbEntry.created_at)).limit(200)).scalars()
    )
    return {"total": len(entries), "items": [_out(e) for e in entries]}


@router.post("")
def create_entry(payload: KbCreate, db: Session = Depends(get_db)) -> dict:
    entry = KbEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _out(entry)


@router.get("/for/{fingerprint}")
def for_fingerprint(fingerprint: str, db: Session = Depends(get_db)) -> dict:
    entries = list(
        db.execute(
            select(KbEntry).where(KbEntry.fingerprint == fingerprint).limit(5)
        ).scalars()
    )
    return {"total": len(entries), "items": [_out(e) for e in entries]}
