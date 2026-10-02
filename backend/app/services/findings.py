import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.db.database import SessionLocal
from app.db.models import Correlation, ErrorFingerprint, Finding, Ticket

logger = logging.getLogger("centro.findings")

NUEVO_HORAS = 24
MIN_OCURRENCIAS_SIN_TICKET = 3
Tipos = ("sin_ticket", "reincidencia", "nuevo", "recurrente")


def run_findings() -> dict:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        fingerprints = db.execute(select(ErrorFingerprint)).scalars().all()
        correlations = db.execute(select(Correlation)).scalars().all()
        tickets = {t.id: t for t in db.execute(select(Ticket)).scalars().all()}

        best: dict[int, Correlation] = {}
        for correlation in sorted(correlations, key=lambda c: -c.score):
            best.setdefault(correlation.fingerprint_id, correlation)

        db.execute(delete(Finding).where(Finding.type.in_(Tipos)))
        db.commit()

        counts = {"sin_ticket": 0, "reincidencia": 0, "nuevo": 0, "recurrente": 0}

        for fp in fingerprints:
            correlation = best.get(fp.id)
            if correlation is None:
                if (fp.occurrences_total or 0) >= MIN_OCURRENCIAS_SIN_TICKET:
                    db.add(
                        Finding(
                            type="sin_ticket",
                            fingerprint_id=fp.id,
                            title=(fp.template or fp.exception_type or "Error")[:200],
                            detail=f"{fp.occurrences_total} ocurrencias sin ticket relacionado.",
                            severity=fp.severity,
                        )
                    )
                    counts["sin_ticket"] += 1
            else:
                ticket = tickets.get(correlation.ticket_id)
                if (
                    ticket
                    and ticket.status_is_closed
                    and ticket.closed_on
                    and fp.last_seen
                    and fp.last_seen > ticket.closed_on
                ):
                    delta = round(
                        (fp.last_seen - ticket.closed_on).total_seconds() / 3600, 1
                    )
                    db.add(
                        Finding(
                            type="reincidencia",
                            fingerprint_id=fp.id,
                            ticket_id=ticket.id,
                            title=f"#{ticket.redmine_id} {ticket.subject[:150]}",
                            detail=(
                                f"Ticket cerrado el {ticket.closed_on.isoformat()} "
                                f"pero hay ocurrencias posteriores (ultima "
                                f"{fp.last_seen.isoformat()}, {delta} h despues del cierre)."
                            ),
                            severity=fp.severity,
                        )
                    )
                    counts["reincidencia"] += 1

            if fp.first_seen and fp.first_seen >= now - timedelta(hours=NUEVO_HORAS):
                db.add(
                    Finding(
                        type="nuevo",
                        fingerprint_id=fp.id,
                        title=(fp.template or "")[:200],
                        detail="Primera aparicion en las ultimas 24 h.",
                        severity=fp.severity,
                    )
                )
                counts["nuevo"] += 1

            if (
                (fp.occurrences_total or 0) >= 10
                and fp.first_seen
                and fp.last_seen
                and (fp.last_seen - fp.first_seen) >= timedelta(days=7)
            ):
                db.add(
                    Finding(
                        type="recurrente",
                        fingerprint_id=fp.id,
                        title=(fp.template or "")[:200],
                        detail=(
                            f"{fp.occurrences_total} ocurrencias en "
                            f"{(fp.last_seen - fp.first_seen).days} dias."
                        ),
                        severity=fp.severity,
                    )
                )
                counts["recurrente"] += 1

        db.commit()
        logger.info("findings=%s", counts)
        return counts
    finally:
        db.close()
