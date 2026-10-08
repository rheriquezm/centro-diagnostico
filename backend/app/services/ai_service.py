import json
import logging
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from hashlib import sha1

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    AiDiagnosis,
    Correlation,
    ErrorBucket,
    ErrorFingerprint,
    Finding,
    Ticket,
    TicketJournal,
)
from app.services.ai.factory import get_provider
from app.services.text import idf, tokenize

logger = logging.getLogger("centro.ai")

PROMPT_VERSION = "v2"
ID_RE = re.compile(r"#?(\d{3,7})")


def _ticket_url(redmine_id: int) -> str:
    base = (settings.REDMINE_URL or "").rstrip("/")
    return f"{base}/issues/{redmine_id}" if base else ""


def _suggest_tickets(db: Session, fingerprint_id: int, limit: int = 5) -> list[dict]:
    """Cuando no hay correlacion previa, sugiere tickets por solapamiento de terminos."""
    fp = db.get(ErrorFingerprint, fingerprint_id)
    if fp is None:
        return []
    error_text = " ".join(
        [
            fp.template or "",
            fp.sample_message or "",
            fp.sample_stack or "",
            fp.exception_type or "",
            fp.application or "",
            fp.service or "",
        ]
    )
    error_tokens = tokenize(error_text)
    if not error_tokens:
        return []

    tickets = db.execute(select(Ticket)).scalars().all()
    document_frequency: Counter = Counter()
    ticket_docs: list[tuple[Ticket, set[str]]] = []
    for t in tickets:
        tokens = tokenize(" ".join([t.subject or "", t.description or ""]))
        ticket_docs.append((t, tokens))
        for token in tokens:
            document_frequency[token] += 1
    weight = idf(document_frequency, max(len(tickets), 1))

    scored: list[tuple[int, float, Ticket, set[str]]] = []
    for t, tokens in ticket_docs:
        comunes = error_tokens & tokens
        if not comunes:
            continue
        score = sum(weight(token) for token in comunes)
        scored.append((len(comunes), score, t, comunes))
    scored.sort(key=lambda item: (-item[0], -item[1]))

    resultado: list[dict] = []
    for comunes_count, _score, t, _comunes in scored[:limit]:
        resultado.append(
            {
                "redmine_id": t.redmine_id,
                "subject": t.subject,
                "status": t.status,
                "priority": t.priority,
                "assigned_to": t.assigned_to,
                "similitud": round(
                    min(95.0, comunes_count / max(len(error_tokens), 1) * 100), 1
                ),
                "sugerido": True,
                "url": _ticket_url(t.redmine_id),
            }
        )
    return resultado


def _call_with_timeout(func, *args, timeout: int):
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func, *args)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeout as exc:
            raise TimeoutError("Tiempo de espera de IA excedido") from exc


def _run_diagnose(context: dict, provider_name: str | None) -> tuple:
    """Ejecuta el diagnostico con cadena de respaldo: elegido -> Ollama -> heuristico."""
    provider = get_provider(provider_name)
    try:
        analysis = _call_with_timeout(
            provider.diagnose, context, timeout=settings.AI_TIMEOUT_SECONDS
        )
        return provider, analysis
    except Exception as exc:  # noqa: BLE001
        logger.warning("fallo proveedor IA (%s): %s", provider.name, exc)

    if (provider_name or settings.AI_PROVIDER or "").lower() != "ollama":
        try:
            from app.services.ai.ollama import OllamaProvider

            local = OllamaProvider()
            analysis = _call_with_timeout(
                local.diagnose, context, timeout=settings.AI_TIMEOUT_SECONDS
            )
            analysis["advertencia"] = (
                f"El proveedor '{provider.name}' no respondio; se uso Ollama local."
            )
            return local, analysis
        except Exception as exc:  # noqa: BLE001
            logger.warning("fallback Ollama fallo: %s", exc)

    from app.services.ai.heuristic import HeuristicProvider

    heur = HeuristicProvider()
    analysis = heur.diagnose(context)
    analysis["advertencia"] = (
        "El proveedor de IA no respondio; se muestra el diagnostico heuristico."
    )
    return heur, analysis


def build_context(db: Session, fingerprint_id: int) -> dict | None:
    fp = db.get(ErrorFingerprint, fingerprint_id)
    if fp is None:
        return None

    correlations = list(
        db.execute(
            select(Correlation)
            .where(Correlation.fingerprint_id == fingerprint_id)
            .order_by(Correlation.score.desc())
        ).scalars()
    )
    tickets = {t.id: t for t in db.execute(select(Ticket)).scalars()}
    relacionados = [
        {
            "redmine_id": tickets[c.ticket_id].redmine_id,
            "subject": tickets[c.ticket_id].subject,
            "status": tickets[c.ticket_id].status,
            "priority": tickets[c.ticket_id].priority,
            "assigned_to": tickets[c.ticket_id].assigned_to,
            "similitud": c.score,
            "sugerido": False,
            "url": _ticket_url(tickets[c.ticket_id].redmine_id),
        }
        for c in correlations
        if c.ticket_id in tickets
    ]
    findings = [
        f.type
        for f in db.execute(
            select(Finding).where(Finding.fingerprint_id == fingerprint_id)
        ).scalars()
    ]

    hosts = db.execute(
        select(ErrorBucket.host, func.sum(ErrorBucket.count))
        .where(ErrorBucket.fingerprint_id == fingerprint_id)
        .group_by(ErrorBucket.host)
        .order_by(func.sum(ErrorBucket.count).desc())
    ).all()
    machines = [host for host, _ in hosts if host]

    return {
        "fingerprint": fp.fingerprint,
        "error": (fp.sample_message or "")[: settings.AI_MAX_STACK_CHARS],
        "normalized_error": (fp.template or "")[: settings.AI_MAX_STACK_CHARS],
        "exception": fp.exception_type,
        "stack_trace": (fp.sample_stack or "")[: settings.AI_MAX_STACK_CHARS],
        "service": fp.service,
        "application": fp.application,
        "severity": fp.severity,
        "class": fp.class_name,
        "method": fp.method,
        "line": fp.line,
        "frequency": fp.occurrences_total,
        "first_seen": fp.first_seen.isoformat() if fp.first_seen else None,
        "last_seen": fp.last_seen.isoformat() if fp.last_seen else None,
        "related_tickets": relacionados,
        "historical_occurrences": fp.occurrences_total,
        "findings": findings,
        "machines": machines,
    }


def _validate_citations(analysis: dict, context: dict) -> tuple[dict, list[int]]:
    permitidos = {t["redmine_id"] for t in context.get("related_tickets", [])}
    text = json.dumps(analysis, ensure_ascii=False)
    citados = {int(m.group(1)) for m in ID_RE.finditer(text)}
    inventados = sorted(cid for cid in citados if cid not in permitidos)
    return analysis, inventados


def _nagios_context(
    machines: list[str] | None = None,
    mapping: dict[str, str] | None = None,
) -> dict | None:
    """Estado actual de Nagios + cruce por maquina via el mapeo Graylog<->Nagios."""
    try:
        from app.connectors.nagios import NagiosClient

        client = NagiosClient()
        if not client.is_configured():
            return None
        hosts = client.hosts()
        services = client.services()
    except Exception as exc:  # noqa: BLE001
        logger.warning("no se pudo obtener contexto de Nagios: %s", exc)
        return None

    mapping = mapping or {}
    por_host = {h["host"]: h for h in hosts}

    por_maquina = []
    for machine in machines or []:
        nagios = mapping.get(machine) or None
        info = por_host.get(nagios) if nagios else None
        svc = [
            {"servicio": s["servicio"], "estado": s["estado"]}
            for s in services
            if nagios and s["host"] == nagios and s["estado"] != "OK"
        ]
        por_maquina.append(
            {
                "graylog_host": machine,
                "nagios_host": nagios,
                "estado": info["estado"] if info else None,
                "servicios_con_problema": svc,
            }
        )

    problemas = [
        {"host": s["host"], "servicio": s["servicio"], "estado": s["estado"]}
        for s in services
        if s["estado"] != "OK"
    ]
    return {
        "hosts": [{"host": h["host"], "estado": h["estado"]} for h in hosts],
        "servicios_con_problema": problemas,
        "por_maquina": por_maquina,
        "conteo": {
            "hosts": len(hosts),
            "servicios": len(services),
            "problemas": len(problemas),
        },
    }


def diagnose(db: Session, fingerprint_id: int, provider_name: str | None = None) -> dict | None:
    context = build_context(db, fingerprint_id)
    if context is None:
        return None

    # Si no hay correlacion previa, sugiere tickets para asociar.
    if not context.get("related_tickets"):
        context["related_tickets"] = _suggest_tickets(db, fingerprint_id)

    # Analisis cruzado: estado actual de Nagios (con mapeo de hosts).
    from app.services.host_mapping import get_mapping

    context["nagios"] = _nagios_context(
        context.get("machines") or [], get_mapping(db)
    )

    provider, analysis = _run_diagnose(context, provider_name)

    analysis, inventados = _validate_citations(analysis, context)
    if inventados:
        analysis["advertencia"] = (
            "IDs citados no verificados descartados: " + ", ".join(map(str, inventados))
        )

    confidence = analysis.get("confidence")
    input_hash = sha1(json.dumps(context, ensure_ascii=False).encode("utf-8")).hexdigest()
    db.add(
        AiDiagnosis(
            fingerprint_id=fingerprint_id,
            provider=provider.name,
            model=getattr(provider, "model", None),
            prompt_version=PROMPT_VERSION,
            input_hash=input_hash,
            output=json.dumps(analysis, ensure_ascii=False),
            confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
        )
    )
    db.commit()

    return {
        "fingerprint_id": fingerprint_id,
        "provider": provider.name,
        "model": getattr(provider, "model", None),
        "prompt_version": PROMPT_VERSION,
        "context": context,
        "analysis": analysis,
        "confidence": confidence,
        "tickets": context.get("related_tickets") or [],
        "aviso": "El diagnostico es una hipotesis asistida; no constituye certeza.",
    }


def diagnose_ticket(
    db: Session, ticket_id: int, provider_name: str | None = None
) -> dict | None:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        return None

    journals = list(
        db.execute(
            select(TicketJournal)
            .where(TicketJournal.ticket_id == ticket_id)
            .order_by(TicketJournal.created_on)
        ).scalars()
    )
    history = [j.notes for j in journals if j.notes]
    texto = " ".join([ticket.subject or "", ticket.description or ""] + history)

    context = {
        "tipo": "ticket",
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "description": (ticket.description or "")[: settings.AI_MAX_STACK_CHARS],
        "project": ticket.project_name,
        "tracker": ticket.tracker,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_to": ticket.assigned_to,
        "iteraciones": len(journals),
        "history": [h[:600] for h in history][:20],
        # claves compatibles con el motor heuristico
        "summary": f"Caso Redmine #{ticket.redmine_id}: {ticket.subject}",
        "error": (ticket.description or "")[: settings.AI_MAX_STACK_CHARS],
        "normalized_error": texto[: settings.AI_MAX_STACK_CHARS],
        "stack_trace": "\n".join(history)[: settings.AI_MAX_STACK_CHARS],
        "application": ticket.project_name,
        "service": ticket.tracker,
        "class": ticket.project_name,
        "method": ticket.tracker,
        "severity": ticket.priority,
        "frequency": len(journals),
        "exception": None,
        "related_tickets": [],
    }

    provider, analysis = _run_diagnose(context, provider_name)

    correlations = list(
        db.execute(
            select(Correlation)
            .where(Correlation.ticket_id == ticket_id)
            .order_by(Correlation.score.desc())
            .limit(10)
        ).scalars()
    )
    fingerprints = {fp.id: fp for fp in db.execute(select(ErrorFingerprint)).scalars()}
    relacionados = [
        {
            "fingerprint_id": c.fingerprint_id,
            "problema": (
                fingerprints[c.fingerprint_id].template
                or fingerprints[c.fingerprint_id].exception_type
                or "—"
            ),
            "severidad": fingerprints[c.fingerprint_id].severity,
            "similitud": c.score,
        }
        for c in correlations
        if c.fingerprint_id in fingerprints
    ]

    input_hash = sha1(json.dumps(context, ensure_ascii=False).encode("utf-8")).hexdigest()
    db.add(
        AiDiagnosis(
            fingerprint_id=None,
            provider=provider.name,
            model=getattr(provider, "model", None),
            prompt_version=PROMPT_VERSION,
            input_hash=input_hash,
            output=json.dumps(analysis, ensure_ascii=False),
            confidence=float(analysis["confidence"])
            if isinstance(analysis.get("confidence"), (int, float))
            else None,
        )
    )
    db.commit()

    return {
        "ticket_id": ticket_id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "provider": provider.name,
        "model": getattr(provider, "model", None),
        "analysis": analysis,
        "confidence": analysis.get("confidence"),
        "related_fingerprints": relacionados,
        "aviso": "El diagnostico es una hipotesis asistida; no constituye certeza.",
    }


def _global_summary(db: Session) -> dict:
    total_fp = int(db.execute(select(func.count(ErrorFingerprint.id))).scalar_one())
    abiertos = int(
        db.execute(
            select(func.count(Ticket.id)).where(Ticket.status_is_closed.is_(False))
        ).scalar_one()
    )
    sin_ticket = int(
        db.execute(select(func.count(Finding.id)).where(Finding.type == "sin_ticket")).scalar_one()
    )
    reincidencias = int(
        db.execute(select(func.count(Finding.id)).where(Finding.type == "reincidencia")).scalar_one()
    )
    return {
        "fingerprints_total": total_fp,
        "tickets_abiertos": abiertos,
        "errores_sin_ticket": sin_ticket,
        "reincidencias": reincidencias,
    }


def assistant(db: Session, question: str, provider_name: str | None = None) -> dict:
    from app.services import problems

    resumen = _global_summary(db)
    top = problems.list_problems(db).get("items", [])[:10]
    contexto = {
        "summary": resumen,
        "findings": [
            {
                "problema": p["problema"],
                "severidad": p["severidad"],
                "ocurrencias": p["ocurrencias"],
                "ticket": p["ticket"]["redmine_id"] if p.get("ticket") else None,
                "sin_ticket": p["sin_ticket"],
                "reincidencia": p["reincidencia"],
            }
            for p in top
        ],
    }

    provider = get_provider(provider_name)
    try:
        result = _call_with_timeout(
            provider.answer, question, contexto, timeout=settings.AI_TIMEOUT_SECONDS
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("fallo asistente IA (%s): %s", provider.name, exc)
        from app.services.ai.heuristic import HeuristicProvider

        provider = HeuristicProvider()
        result = provider.answer(question, contexto)

    return {
        "pregunta": question,
        "respuesta": result,
        "contexto": contexto,
        "provider": provider.name,
        "aviso": "Respuesta anclada al contexto entregado (datos reales de la base).",
    }
