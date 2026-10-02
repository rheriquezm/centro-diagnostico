import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.connectors.redmine import RedmineClient
from app.db.database import SessionLocal
from app.db.models import SyncRun, Ticket, TicketJournal

logger = logging.getLogger("centro.redmine_sync")

CLOSED_STATUSES = {
    "cerrada",
    "cerrado",
    "resuelta",
    "resuelto",
    "closed",
    "rechazada",
    "rechazado",
    "duplicada",
}


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _to_ticket(issue: dict) -> dict:
    project = issue.get("project") or {}
    status = issue.get("status") or {}
    status_name = status.get("name")
    return {
        "redmine_id": issue.get("id"),
        "project_id": project.get("id"),
        "project_name": project.get("name"),
        "tracker": (issue.get("tracker") or {}).get("name"),
        "status": status_name,
        "status_is_closed": bool(status.get("is_closed"))
        or (status_name or "").lower() in CLOSED_STATUSES,
        "priority": (issue.get("priority") or {}).get("name"),
        "category": (issue.get("category") or {}).get("name"),
        "author": (issue.get("author") or {}).get("name"),
        "assigned_to": (issue.get("assigned_to") or {}).get("name"),
        "subject": (issue.get("subject") or "")[:512],
        "description": issue.get("description"),
        "created_on": _parse_dt(issue.get("created_on")),
        "updated_on": _parse_dt(issue.get("updated_on")),
        "closed_on": _parse_dt(issue.get("closed_on")),
        "raw": json.dumps(issue, ensure_ascii=False)[:200000],
    }


def sync_tickets(max_issues: int = 500, include_journals: bool = True) -> dict:
    db = SessionLocal()
    run = SyncRun(connector="redmine", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        client = RedmineClient()
        existing = {
            t.redmine_id: t for t in db.execute(select(Ticket)).scalars().all()
        }
        total = nuevos = actualizados = 0
        include = "journals" if include_journals else None

        for issue in client.iter_issues(max_issues=max_issues, include=include):
            total += 1
            data = _to_ticket(issue)
            ticket = existing.get(data["redmine_id"])
            if ticket is None:
                ticket = Ticket(**data)
                db.add(ticket)
                db.flush()
                existing[data["redmine_id"]] = ticket
                nuevos += 1
            else:
                for field, value in data.items():
                    setattr(ticket, field, value)
                actualizados += 1

            if include_journals and issue.get("journals"):
                ticket.journals.clear()
                for journal in issue.get("journals") or []:
                    notes = journal.get("notes")
                    if not notes:
                        continue
                    ticket.journals.append(
                        TicketJournal(
                            journal_id=journal.get("id"),
                            author=(journal.get("user") or {}).get("name"),
                            notes=notes,
                            created_on=_parse_dt(journal.get("created_on")),
                        )
                    )
            if total % 50 == 0:
                db.commit()

        db.commit()
        run.status = "completed"
        run.items = total
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("redmine sync total=%s nuevos=%s act=%s", total, nuevos, actualizados)
        return {"total": total, "nuevos": nuevos, "actualizados": actualizados}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run.status = "error"
        run.error = str(exc)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("error sync redmine")
        raise
    finally:
        db.close()
