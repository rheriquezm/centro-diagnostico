from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ErrorFingerprint, KbEntry, Ticket

router = APIRouter(
    prefix="/search",
    tags=["search"],
    dependencies=[Depends(get_current_user)],
)


@router.get("")
def search(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
) -> dict:
    like = f"%{q}%"

    fingerprints = list(
        db.execute(
            select(ErrorFingerprint)
            .where(
                or_(
                    ErrorFingerprint.template.ilike(like),
                    ErrorFingerprint.exception_type.ilike(like),
                    ErrorFingerprint.class_name.ilike(like),
                    ErrorFingerprint.sample_message.ilike(like),
                )
            )
            .limit(20)
        ).scalars()
    )
    tickets = list(
        db.execute(
            select(Ticket)
            .where(or_(Ticket.subject.ilike(like), Ticket.description.ilike(like)))
            .limit(20)
        ).scalars()
    )
    knowledge = list(
        db.execute(
            select(KbEntry)
            .where(
                or_(
                    KbEntry.problem.ilike(like),
                    KbEntry.cause.ilike(like),
                    KbEntry.solution.ilike(like),
                )
            )
            .limit(20)
        ).scalars()
    )

    return {
        "query": q,
        "fingerprints": [
            {
                "id": f.id,
                "problema": (f.template or f.exception_type or "")[:200],
                "severidad": f.severity,
                "ocurrencias": f.occurrences_total,
            }
            for f in fingerprints
        ],
        "tickets": [
            {
                "redmine_id": t.redmine_id,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
            }
            for t in tickets
        ],
        "knowledge": [
            {"id": k.id, "problem": k.problem, "solution": k.solution}
            for k in knowledge
        ],
    }
