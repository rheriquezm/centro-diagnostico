import json
import logging
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.db.database import SessionLocal
from app.db.models import Correlation, ErrorFingerprint, Ticket, TicketJournal
from app.services.text import idf, tokenize

logger = logging.getLogger("centro.correlation")

DEFAULT_THRESHOLD = 50.0
MAX_MATCHES = 3
SCORE_SCALE = 25.0


def _ticket_tokens(db, ticket: Ticket) -> set[str]:
    journals = db.execute(
        select(TicketJournal).where(TicketJournal.ticket_id == ticket.id)
    ).scalars().all()
    text = " ".join(
        [ticket.subject or "", ticket.description or ""]
        + [j.notes or "" for j in journals]
    )
    return tokenize(text)


def run_correlation(threshold: float = DEFAULT_THRESHOLD) -> dict:
    db = SessionLocal()
    try:
        fingerprints = db.execute(select(ErrorFingerprint)).scalars().all()
        tickets = db.execute(select(Ticket)).scalars().all()

        ticket_docs = []
        document_frequency: Counter = Counter()
        for ticket in tickets:
            tokens = _ticket_tokens(db, ticket)
            ticket_docs.append((ticket, tokens))
            for token in tokens:
                document_frequency[token] += 1

        weight = idf(document_frequency, max(len(tickets), 1))

        db.execute(delete(Correlation))
        db.commit()

        creadas = 0
        for fp in fingerprints:
            error_text = " ".join(
                [
                    fp.template or "",
                    fp.sample_message or "",
                    fp.sample_stack or "",
                    fp.exception_type or "",
                    fp.class_name or "",
                    fp.method or "",
                    fp.application or "",
                    fp.service or "",
                ]
            )
            error_tokens = tokenize(error_text)
            comp_tokens = tokenize(
                " ".join(
                    [
                        fp.exception_type or "",
                        fp.class_name or "",
                        fp.method or "",
                        fp.application or "",
                        fp.service or "",
                    ]
                )
            )
            if not error_tokens:
                continue

            found = []
            for ticket, ticket_tokens in ticket_docs:
                comunes = error_tokens & ticket_tokens
                comp_match = bool(comp_tokens & ticket_tokens)
                if not comunes and not comp_match:
                    continue
                score = sum(weight(token) for token in comunes) + (
                    3.0 if comp_match else 0.0
                )
                found.append((score, comunes, comp_match, ticket))

            if not found:
                continue
            found.sort(key=lambda item: -item[0])

            for score, comunes, comp_match, ticket in found[:MAX_MATCHES]:
                normalizado = round(min(100.0, (score / SCORE_SCALE) * 100.0), 1)
                if normalizado < threshold:
                    continue
                if not comp_match and len(comunes) < 3:
                    continue
                db.add(
                    Correlation(
                        fingerprint_id=fp.id,
                        ticket_id=ticket.id,
                        score=normalizado,
                        method="tokens+componentes",
                        evidence=json.dumps(
                            {
                                "palabras": sorted(comunes)[:12],
                                "coincidencia_componente": comp_match,
                                "ticket": ticket.redmine_id,
                                "subject": ticket.subject[:180],
                                "terminos_error": len(error_tokens),
                            },
                            ensure_ascii=False,
                        ),
                    )
                )
                creadas += 1
        db.commit()
        logger.info("correlacion creada=%s fingerprints=%s", creadas, len(fingerprints))
        return {"correlaciones": creadas, "fingerprints": len(fingerprints)}
    finally:
        db.close()
