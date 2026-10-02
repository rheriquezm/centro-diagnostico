from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import Correlation, ErrorBucket, ErrorFingerprint, Finding, Ticket


def _best_correlations(db: Session) -> dict[int, Correlation]:
    best: dict[int, Correlation] = {}
    for correlation in db.execute(
        select(Correlation).order_by(desc(Correlation.score))
    ).scalars():
        best.setdefault(correlation.fingerprint_id, correlation)
    return best


def _trend_map(db: Session) -> dict[int, str]:
    now = datetime.now(timezone.utc)
    recent = now - timedelta(hours=24)
    prev = now - timedelta(hours=48)
    agg: dict[int, list[int]] = {}
    for bucket in db.execute(select(ErrorBucket)).scalars():
        entry = agg.setdefault(bucket.fingerprint_id, [0, 0])
        if bucket.bucket_hour >= recent:
            entry[0] += bucket.count
        elif bucket.bucket_hour >= prev:
            entry[1] += bucket.count

    trends = {}
    for fid, (r, p) in agg.items():
        if r > p * 1.2:
            trends[fid] = "sube"
        elif r < p * 0.8:
            trends[fid] = "baja"
        else:
            trends[fid] = "estable"
    return trends


def list_problems(
    db: Session,
    aplicacion: str | None = None,
    servicio: str | None = None,
    severidad: str | None = None,
    con_ticket: bool | None = None,
    q: str | None = None,
) -> dict:
    fingerprints = list(
        db.execute(
            select(ErrorFingerprint).order_by(desc(ErrorFingerprint.last_seen))
        ).scalars()
    )
    best = _best_correlations(db)
    tickets = {t.id: t for t in db.execute(select(Ticket)).scalars()}
    findings: dict[int, set] = {}
    for finding in db.execute(select(Finding)).scalars():
        findings.setdefault(finding.fingerprint_id, set()).add(finding.type)
    trends = _trend_map(db)

    items = []
    for fp in fingerprints:
        if aplicacion and fp.application != aplicacion:
            continue
        if servicio and fp.service != servicio:
            continue
        if severidad and fp.severity != severidad:
            continue
        if q:
            haystack = f"{fp.template or ''} {fp.exception_type or ''} {fp.class_name or ''}".lower()
            if q.lower() not in haystack:
                continue

        correlation = best.get(fp.id)
        ticket = tickets.get(correlation.ticket_id) if correlation else None
        types = findings.get(fp.id, set())

        if con_ticket is True and ticket is None:
            continue
        if con_ticket is False and ticket is not None:
            continue

        items.append(_problem_dict(fp, correlation, ticket, types, trends.get(fp.id)))

    return {"total": len(items), "items": items}


def _problem_dict(
    fp: ErrorFingerprint,
    correlation: Correlation | None,
    ticket: Ticket | None,
    types: set,
    trend: str | None,
) -> dict:
    return {
        "id": fp.id,
        "fingerprint": fp.fingerprint,
        "severidad": fp.severity,
        "problema": (fp.template or fp.exception_type or "Error")[:300],
        "exception_type": fp.exception_type,
        "aplicacion": fp.application,
        "servicio": fp.service,
        "clase": fp.class_name,
        "metodo": fp.method,
        "linea": fp.line,
        "ocurrencias": fp.occurrences_total,
        "primera": fp.first_seen,
        "ultima": fp.last_seen,
        "tendencia": trend,
        "ticket": (
            {
                "id": ticket.id,
                "redmine_id": ticket.redmine_id,
                "subject": ticket.subject,
                "status": ticket.status,
                "priority": ticket.priority,
                "closed": ticket.status_is_closed,
                "similitud": correlation.score if correlation else None,
            }
            if ticket
            else None
        ),
        "sin_ticket": "sin_ticket" in types,
        "reincidencia": "reincidencia" in types,
        "nuevo": "nuevo" in types,
        "recurrente": "recurrente" in types,
    }


def problem_detail(db: Session, fingerprint_id: int) -> dict | None:
    fp = db.get(ErrorFingerprint, fingerprint_id)
    if fp is None:
        return None

    correlations = list(
        db.execute(
            select(Correlation)
            .where(Correlation.fingerprint_id == fingerprint_id)
            .order_by(desc(Correlation.score))
        ).scalars()
    )
    tickets = {t.id: t for t in db.execute(select(Ticket)).scalars()}
    findings = list(
        db.execute(select(Finding).where(Finding.fingerprint_id == fingerprint_id)).scalars()
    )
    buckets = list(
        db.execute(
            select(ErrorBucket)
            .where(ErrorBucket.fingerprint_id == fingerprint_id)
            .order_by(ErrorBucket.bucket_hour)
        ).scalars()
    )

    series = [
        {"hora": b.bucket_hour, "host": b.host, "count": b.count} for b in buckets
    ]

    return {
        "fingerprint": {
            "id": fp.id,
            "hash": fp.fingerprint,
            "severidad": fp.severity,
            "exception_type": fp.exception_type,
            "aplicacion": fp.application,
            "servicio": fp.service,
            "clase": fp.class_name,
            "metodo": fp.method,
            "linea": fp.line,
            "ocurrencias": fp.occurrences_total,
            "primera": fp.first_seen,
            "ultima": fp.last_seen,
            "template": fp.template,
            "sample_message": fp.sample_message,
            "sample_stack": fp.sample_stack,
        },
        "tickets": [
            {
                "redmine_id": tickets[c.ticket_id].redmine_id,
                "subject": tickets[c.ticket_id].subject,
                "status": tickets[c.ticket_id].status,
                "priority": tickets[c.ticket_id].priority,
                "closed": tickets[c.ticket_id].status_is_closed,
                "closed_on": tickets[c.ticket_id].closed_on,
                "similitud": c.score,
                "evidencia": c.evidence,
            }
            for c in correlations
            if c.ticket_id in tickets
        ],
        "findings": [
            {"type": f.type, "title": f.title, "detail": f.detail, "severity": f.severity}
            for f in findings
        ],
        "series": series,
    }
