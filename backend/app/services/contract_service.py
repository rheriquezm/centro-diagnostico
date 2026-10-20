import io
import json
import logging
import re
from datetime import datetime, timezone

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Contract, SlaEntry, Ticket, TicketJournal
from app.services.ai.factory import get_provider

logger = logging.getLogger("centro.contract")

CONTEXT_MAX_CHARS = 50000
OLLAMA_CONTEXT_CHARS = 5000
TICKETS_LIMIT = 300
OCR_MAX_PAGES = 40

SYSTEM_DIAGNOSE = (
    "Eres un experto en contratos de desarrollo de software y garantias. "
    "Usando SOLO los DOCUMENTOS y el CASO entregados, determina si el caso esta "
    "cubierto por la garantia/mantenimiento del contrato o si constituye un "
    "NUEVO DESARROLLO (fuera de alcance). No inventes clausulas que no esten en "
    "los documentos. Responde UNICAMENTE con JSON con las claves: "
    "veredicto ('garantia'|'nuevo_desarrollo'|'indeterminado'), confianza (0-1), "
    "justificacion (texto), clausulas (lista de fragmentos), acciones (lista)."
)

SYSTEM_CHAT = (
    "Eres un asistente experto (estilo NotebookLM). Respondes SOLO con base en los "
    "DOCUMENTOS y los TICKETS DE REDMINE entregados. Redacta una respuesta FLUIDA y "
    "coherente, como una guia clara que indique a que debemos ajustarnos por contrato; "
    "no copies parrafos largos del contrato, citelo brevemente (documento y clausula). "
    "Puedes citar tickets por su #id. Si algo no esta en el contexto, dilo y no lo "
    "inventes. Responde en espanol (maximo 150 palabras). Devuelve UNICAMENTE JSON con "
    "las claves: respuesta (texto), fuentes (lista de hasta 4 {documento, fragmento} de "
    "maximo 200 caracteres), tickets (lista de IDs citados), confianza (0-1)."
)

SYSTEM_SLA = (
    "Extrae del CONTRATO los Acuerdos de Nivel de Servicio (SLA). Devuelve UNICAMENTE "
    "JSON con la clave 'slas': lista de objetos {criticidad, descripcion, "
    "tiempo_respuesta, tiempo_resolucion, penalidad}. Si un dato no aparece, dejalo en "
    "blanco. No inventes valores."
)


def _ocr_image(image) -> str:
    import pytesseract

    try:
        return pytesseract.image_to_string(image, lang="spa+eng")
    except Exception:  # noqa: BLE001
        return pytesseract.image_to_string(image, lang="eng")


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _pdf_ocr(data: bytes) -> str:
    from pdf2image import convert_from_bytes

    pages = convert_from_bytes(
        data, dpi=200, first_page=1, last_page=OCR_MAX_PAGES
    )
    return "\n".join(_ocr_image(p) for p in pages)


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        text = ""
        try:
            text = _pdf_text(data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("pypdf fallo: %s", exc)
        if len(text.strip()) >= 200:
            return text
        # Sin capa de texto suficiente -> PDF escaneado: aplicar OCR.
        try:
            ocr = _pdf_ocr(data)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"PDF escaneado y el OCR fallo: {exc}") from exc
        if len(ocr.strip()) > len(text.strip()):
            return ocr
        if not text.strip():
            raise ValueError(
                "No se pudo extraer texto (PDF escaneado sin OCR utilizable)."
            )
        return text
    if name.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp")):
        from PIL import Image

        try:
            return _ocr_image(Image.open(io.BytesIO(data)))
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"No se pudo leer la imagen: {exc}") from exc
    return data.decode("utf-8", errors="ignore")


def list_documents(db: Session) -> list[Contract]:
    return list(
        db.execute(select(Contract).order_by(desc(Contract.uploaded_at))).scalars()
    )


def save_document(db: Session, name: str, content: str) -> Contract:
    doc = Contract(name=name[:255], content=content, chars=len(content))
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def delete_document(db: Session, doc_id: int) -> bool:
    doc = db.get(Contract, doc_id)
    if doc is None:
        return False
    db.delete(doc)
    db.commit()
    return True


def documents_text(db: Session, max_chars: int = CONTEXT_MAX_CHARS) -> str:
    partes: list[str] = []
    total = 0
    for doc in list(
        db.execute(select(Contract).order_by(Contract.uploaded_at)).scalars()
    ):
        restante = max_chars - total
        if restante <= 0:
            break
        chunk = (doc.content or "")[:restante]
        partes.append(f"### DOCUMENTO: {doc.name}\n{chunk}")
        total += len(chunk)
    return "\n\n".join(partes)


def _chunks(db: Session, size: int = 800) -> list[tuple[str, str]]:
    """Divide los documentos en fragmentos (~clausulas/parrafos)."""
    trozos: list[tuple[str, str]] = []
    for doc in list_documents(db):
        texto = re.sub(r"[ \t]+", " ", doc.content or "")
        parrafos = [p.strip() for p in re.split(r"\n\s*\n", texto) if p.strip()]
        buffer = ""
        for p in parrafos:
            if buffer and len(buffer) + len(p) > size:
                trozos.append((doc.name, buffer))
                buffer = p
            else:
                buffer = (buffer + "\n" + p).strip() if buffer else p
        if buffer:
            trozos.append((doc.name, buffer))
    return trozos


def _extractos(chunks: list[tuple[str, str]], texto: str, top: int = 3) -> list[dict]:
    from app.services.text import tokenize

    tokens = tokenize(texto)
    if not tokens or not chunks:
        return []
    scored: list[tuple[int, str, str]] = []
    for nombre, trozo in chunks:
        comunes = tokens & tokenize(trozo)
        if comunes:
            scored.append((len(comunes), nombre, trozo))
    scored.sort(key=lambda item: -item[0])
    return [
        {
            "documento": nombre,
            "fragmento": trozo[:400] + ("..." if len(trozo) > 400 else ""),
            "coincidencias": n,
        }
        for n, nombre, trozo in scored[:top]
    ]


def relevant_extracts(db: Session, texto: str, top: int = 5) -> list[dict]:
    return _extractos(_chunks(db), texto, top)


def _tickets_context(db: Session, limit: int = TICKETS_LIMIT) -> str:
    filas = db.execute(
        select(Ticket).order_by(desc(Ticket.updated_on).nullslast()).limit(limit)
    ).scalars()
    lineas = []
    for t in filas:
        lineas.append(
            f"#{t.redmine_id} [{t.status or ''}] {t.subject[:140]} "
            f"({t.project_name or ''})"
        )
    return "\n".join(lineas)


def _call(func, timeout: int):
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeout as exc:
            raise TimeoutError("IA: tiempo de espera excedido") from exc


def _structured(provider, system: str, user: str, timeout: int | None = None) -> dict:
    chat = getattr(provider, "_chat", None)
    if chat is None:
        raise RuntimeError("El proveedor no soporta analisis estructurado")
    return _call(lambda: chat(system, user), timeout or settings.AI_TIMEOUT_SECONDS)


def _run(
    system: str, user: str, user_small: str, provider_name: str | None
) -> tuple[dict, str]:
    """Respaldo: proveedor elegido -> Ollama (contexto reducido) -> {}."""
    elegido = (provider_name or settings.AI_PROVIDER or "none").lower()
    if elegido != "ollama":
        try:
            return (
                _structured(get_provider(provider_name), system, user, timeout=45),
                elegido,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("fallo IA %s: %s", elegido, exc)
    try:
        from app.services.ai.ollama import OllamaProvider

        return (
            _structured(OllamaProvider(), system, user_small, timeout=75),
            "ollama",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("fallback Ollama fallo: %s", exc)
    return {}, "heuristica"


def _heuristica(caso: dict) -> dict:
    texto = (
        (caso.get("subject") or "")
        + " "
        + (caso.get("description") or "")
        + " "
        + " ".join(caso.get("historial") or [])
    ).lower()
    terminos = [
        "error",
        "falla",
        "fallo",
        "bug",
        "no funciona",
        "incidencia",
        "defecto",
        "garantia",
        "corrig",
        "excepcion",
        "corrup",
        "timeout",
    ]
    votos = sum(1 for t in terminos if t in texto)
    if votos >= 2:
        return {
            "veredicto": "garantia",
            "confianza": 0.45,
            "justificacion": "El caso describe un comportamiento defectuoso (posible error), tipico de garantia.",
            "clausulas": [],
            "acciones": ["Revisar la clausula de garantia/mantenimiento del contrato."],
        }
    if votos == 1:
        return {
            "veredicto": "indeterminado",
            "confianza": 0.35,
            "justificacion": "Se detectan indicios de defecto; requiere revision manual del contrato.",
            "clausulas": [],
            "acciones": ["Contrastar el caso con el alcance del contrato."],
        }
    return {
        "veredicto": "nuevo_desarrollo",
        "confianza": 0.4,
        "justificacion": "El caso parece una solicitud funcional (cambio/mejora) mas que un defecto.",
        "clausulas": [],
        "acciones": ["Evaluar como nuevo requerimiento (fuera de garantia)."],
    }


def _ids(val) -> list[int]:
    if not isinstance(val, list):
        return []
    out: list[int] = []
    for x in val:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            import re

            m = re.search(r"\d+", str(x))
            if m:
                out.append(int(m.group(0)))
    return out[:50]


def _fallback_respuesta(db: Session, question: str) -> str:
    """Respuesta determinista (sin IA): casos + extracto del contrato que los fundamenta."""
    q = question.lower()
    if any(k in q for k in ("ticket", "caso", "garantia", "incidencia")):
        patrones = [
            "error",
            "falla",
            "fallo",
            "bug",
            "incidencia",
            "defecto",
            "no funciona",
            "corrig",
            "excepcion",
            "timeout",
        ]
        filas = list(
            db.execute(
                select(Ticket)
                .where(Ticket.status_is_closed.is_(False))
                .order_by(desc(Ticket.updated_on).nullslast())
                .limit(400)
            ).scalars()
        )
        chunks = _chunks(db)
        matches = [
            t
            for t in filas
            if any(
                p
                in ((t.subject or "") + " " + (t.description or "")).lower()
                for p in patrones
            )
        ]
        seleccion = (matches or filas)[:10]
        lineas = []
        for t in seleccion:
            lineas.append(f"- **#{t.redmine_id}** [{t.status or ''}] {(t.subject or '')[:110]}")
            ex = _extractos(chunks, (t.subject or "") + " " + (t.description or ""), top=1)
            if ex:
                lineas.append(
                    f"> Fundamento ({ex[0]['documento']}): \"{ex[0]['fragmento'][:220]}\""
                )
        return (
            "**Casos candidatos a garantía y su fundamento en el contrato** "
            "(respaldo sin IA)\n\n" + "\n".join(lineas)
        )
    return "No se pudo consultar la IA en este momento; reintenta en unos segundos."


def answer_question(
    db: Session, question: str, provider_name: str | None = None
) -> dict:
    docs = list_documents(db)
    if not docs:
        return {"error": "No hay documentos cargados. Sube contratos/anexos primero."}

    tickets_ctx = _tickets_context(db)
    contexto_full = (
        "DOCUMENTOS:\n"
        + documents_text(db, CONTEXT_MAX_CHARS)
        + "\n\nTICKETS DE REDMINE (puedes citarlos por #id):\n"
        + tickets_ctx
    )
    contexto_small = (
        "DOCUMENTOS:\n"
        + documents_text(db, OLLAMA_CONTEXT_CHARS)
        + "\n\nTICKETS DE REDMINE:\n"
        + tickets_ctx[:3000]
    )
    result, used = _run(
        SYSTEM_CHAT,
        contexto_full + "\n\nPREGUNTA:\n" + question,
        contexto_small + "\n\nPREGUNTA:\n" + question,
        provider_name,
    )

    respuesta = ""
    if result:
        respuesta = result.get("respuesta") or result.get("answer") or ""
    if not respuesta:
        respuesta = _fallback_respuesta(db, question)
        used = "respaldo (sin IA)"

    return {
        "question": question,
        "respuesta": respuesta,
        "fuentes": (result.get("fuentes") if result else []) or [],
        "tickets": _ids(result.get("tickets")) if result else [],
        "confianza": result.get("confianza") if result else None,
        "provider": used,
        "documentos": [d.name for d in docs],
    }


def analyze_ticket(
    db: Session, ticket_id: int, provider_name: str | None = None
) -> dict | None:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        return None
    docs = list_documents(db)
    if not docs:
        return {"error": "No hay documentos cargados. Sube el contrato en Redmine."}

    journals = list(
        db.execute(
            select(TicketJournal)
            .where(TicketJournal.ticket_id == ticket_id)
            .order_by(TicketJournal.created_on)
        ).scalars()
    )
    caso = {
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "description": (ticket.description or "")[:4000],
        "project": ticket.project_name,
        "tracker": ticket.tracker,
        "status": ticket.status,
        "priority": ticket.priority,
        "historial": [j.notes for j in journals if j.notes][-10:],
    }
    extractos = relevant_extracts(
        db, (ticket.subject or "") + " " + (ticket.description or ""), top=5
    )
    user = (
        "DOCUMENTOS:\n"
        + documents_text(db, CONTEXT_MAX_CHARS)
        + "\n\nCASO (ticket):\n"
        + json.dumps(caso, ensure_ascii=False)
    )
    user_small = (
        "DOCUMENTOS:\n"
        + documents_text(db, OLLAMA_CONTEXT_CHARS)
        + "\n\nCASO (ticket):\n"
        + json.dumps(caso, ensure_ascii=False)
    )

    result, used = _run(SYSTEM_DIAGNOSE, user, user_small, provider_name)
    if not result:
        result = _heuristica(caso)
        used = "heuristica"

    veredicto = str(result.get("veredicto") or "indeterminado").lower()
    if veredicto not in ("garantia", "nuevo_desarrollo", "indeterminado"):
        veredicto = "indeterminado"

    return {
        "ticket_id": ticket_id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "provider": used,
        "contrato": ", ".join(d.name for d in docs[:3]),
        "veredicto": veredicto,
        "confianza": result.get("confianza"),
        "justificacion": result.get("justificacion"),
        "clausulas": result.get("clausulas") or [],
        "extractos": extractos,
        "acciones": result.get("acciones") or [],
        "aviso": "Analisis asistido; no constituye opinion legal. Verifique contra el contrato.",
    }


def _es_sla(texto: str) -> bool:
    t = texto.lower()
    return any(
        k in t
        for k in (
            "sla",
            "nivel de servicio",
            "tiempo de respuesta",
            "tiempo de resolucion",
            "tiempo de resolución",
            "criticidad",
            "mttr",
        )
    )


def list_slas(db: Session) -> list[SlaEntry]:
    return list(
        db.execute(select(SlaEntry).order_by(SlaEntry.orden, SlaEntry.id)).scalars()
    )


def save_slas(db: Session, rows: list[dict]) -> list[SlaEntry]:
    db.execute(delete(SlaEntry))
    for i, r in enumerate(rows):
        db.add(
            SlaEntry(
                orden=i,
                criticidad=(str(r.get("criticidad") or ""))[:120] or None,
                descripcion=(str(r.get("descripcion") or ""))[:2000] or None,
                tiempo_respuesta=(str(r.get("tiempo_respuesta") or ""))[:160] or None,
                tiempo_resolucion=(str(r.get("tiempo_resolucion") or ""))[:160] or None,
                penalidad=(str(r.get("penalidad") or ""))[:255] or None,
                nota=(str(r.get("nota") or ""))[:2000] or None,
            )
        )
    db.commit()
    return list_slas(db)


def sla_sections(db: Session) -> list[dict]:
    """Texto literal de la seccion de SLA de cada documento (fiel al contrato)."""
    claves = (
        "nivel de servicio",
        "acuerdos nominal",
        "acuerdos de nivel",
        "tiempo de respuesta",
        "sla",
    )
    secciones = []
    for doc in list_documents(db):
        lineas = (doc.content or "").splitlines()
        idx = None
        for i, ln in enumerate(lineas):
            l = ln.lower()
            if any(k in l for k in claves):
                idx = i
                break
        if idx is None:
            continue
        bloque = "\n".join(lineas[max(0, idx - 2) : idx + 90])
        secciones.append({"documento": doc.name, "texto": bloque})
    return secciones[:3]


def extraer_slas(db: Session, provider_name: str | None = None) -> dict:
    chunks = [t for (_n, t) in _chunks(db) if _es_sla(t)]
    if not chunks:
        return {
            "propuesta": [],
            "provider": "—",
            "aviso": "No se encontro una seccion de SLA en los documentos.",
        }
    texto = "\n\n".join(chunks)[:14000]
    result, used = _run(
        SYSTEM_SLA,
        "CONTRATO (secciones de SLA):\n" + texto,
        "CONTRATO:\n" + texto[:5000],
        provider_name,
    )
    propuesta = result.get("slas") if isinstance(result.get("slas"), list) else []
    if not propuesta:
        propuesta = [
            {
                "criticidad": "",
                "descripcion": c[:500],
                "tiempo_respuesta": "",
                "tiempo_resolucion": "",
                "penalidad": "",
            }
            for c in chunks[:8]
        ]
        used = "respaldo (sin IA)"
    return {"propuesta": propuesta[:20], "provider": used}


def _parse_horas(texto: str | None) -> float | None:
    if not texto:
        return None
    t = str(texto).lower()
    m = re.search(
        r"(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|h\b|d[ií]as?|minutos?|mins?)", t
    )
    if not m:
        return None
    n = float(m.group(1).replace(",", "."))
    u = m.group(2)
    if u.startswith("dia") or u.startswith("dí"):
        return round(n * 24, 2)
    if u.startswith("min"):
        return round(n / 60, 2)
    return n


def _sla_para(db: Session, ticket: Ticket) -> SlaEntry | None:
    filas = list_slas(db)
    if not filas:
        return None
    prio = (ticket.priority or "").lower()
    for f in filas:
        if prio and prio in (f.criticidad or "").lower():
            return f
    sinonimos = {
        "urgente": ("alta", "urgen", "critic"),
        "inmediata": ("alta",),
        "alta": ("alta",),
        "normal": ("media", "medi"),
        "media": ("media", "medi"),
        "baja": ("baja", "baj"),
    }
    for f in filas:
        crit = (f.criticidad or "").lower()
        for token in sinonimos.get(prio, ()):
            if token in crit:
                return f
    return filas[0]


def _num_horas(seg: str, patron: str) -> str | None:
    m = re.search(patron, seg, re.I | re.S)
    return m.group(1) if m else None


def _sla_desde_contrato(db: Session) -> list[dict]:
    """Extrae (deterministicamente) los SLA por criticidad del contrato."""
    texto = "\n".join(d.content or "" for d in list_documents(db))
    bajo = texto.lower()
    filas = []
    for crit in ("alta", "media", "baja"):
        i = bajo.find(f"criticidad {crit}")
        if i < 0:
            continue
        j = len(texto)
        for otra in ("alta", "media", "baja"):
            k = bajo.find(f"criticidad {otra}", i + 1)
            if k > 0:
                j = min(j, k)
        seg = texto[i:j]
        resp = _num_horas(seg, r"disponer en[^.)]{0,90}?\((\d+)\)")
        resol = _num_horas(seg, r"soluci[oó]n\s+propuesta[^.)]{0,140}?\((\d+)\)")
        if resol is None:
            resol = _num_horas(seg, r"a las\s*\(?(\d+)\)?\s*horas de ser")
        filas.append(
            {
                "criticidad": crit.capitalize(),
                "descripcion": f"Criticidad {crit} (contrato)",
                "tiempo_respuesta": f"{resp} horas" if resp else "",
                "tiempo_resolucion": f"{resol} horas" if resol else "",
                "penalidad": "",
            }
        )
    return [f for f in filas if f["tiempo_respuesta"] or f["tiempo_resolucion"]]


def _asegurar_slas(db: Session) -> None:
    """Si no hay SLA guardados, los deriva del contrato."""
    if list_slas(db):
        return
    filas = _sla_desde_contrato(db)
    if filas:
        save_slas(db, filas)


def _estado(tiempo: float | None, sla: float | None) -> str:
    if sla is None:
        return "n/a"
    if tiempo is None:
        return "sin_dato"
    return "cumple" if tiempo <= sla else "excede"


def cumplimiento_ticket(db: Session, ticket: Ticket) -> dict:
    sla = _sla_para(db, ticket)
    creado = ticket.created_on
    primera = db.execute(
        select(func.min(TicketJournal.created_on)).where(
            TicketJournal.ticket_id == ticket.id
        )
    ).scalar_one_or_none()
    ahora = datetime.now(timezone.utc)
    cerrado = ticket.closed_on

    def _horas(a, b):
        if not a or not b:
            return None
        return round((a - b).total_seconds() / 3600, 1)

    t_resp = _horas(primera, creado)
    fin = cerrado or (None if ticket.status_is_closed else ahora)
    t_resol = _horas(fin, creado)

    sla_resp = _parse_horas(sla.tiempo_respuesta) if sla else None
    sla_resol = _parse_horas(sla.tiempo_resolucion) if sla else None

    est_resp = _estado(t_resp, sla_resp)
    est_resol = _estado(t_resol, sla_resol)

    estados = [e for e in (est_resp, est_resol) if e in ("cumple", "excede")]
    if "excede" in estados:
        global_ = "excede"
    elif "cumple" in estados:
        global_ = "cumple"
    else:
        global_ = "n/a"

    return {
        "id": ticket.id,
        "redmine_id": ticket.redmine_id,
        "subject": ticket.subject,
        "url": f"{(settings.REDMINE_URL or '').rstrip('/')}/issues/{ticket.redmine_id}",
        "priority": ticket.priority,
        "status": ticket.status,
        "closed": ticket.status_is_closed,
        "creado": creado,
        "primera_respuesta": primera,
        "cerrado": cerrado,
        "tiempo_respuesta_h": t_resp,
        "tiempo_resolucion_h": t_resol,
        "sla_criticidad": sla.criticidad if sla else None,
        "sla_respuesta_h": sla_resp,
        "sla_resolucion_h": sla_resol,
        "estado_respuesta": est_resp,
        "estado_resolucion": est_resol,
        "estado": global_,
    }


def _sla_clausula(db: Session, criticidad: str | None) -> str | None:
    if not criticidad:
        return None
    crit = criticidad.lower()
    texto = "\n".join(d.content or "" for d in list_documents(db))
    bajo = texto.lower()
    i = bajo.find(f"criticidad {crit}")
    if i < 0:
        return None
    j = len(texto)
    for otra in ("alta", "media", "baja"):
        k = bajo.find(f"criticidad {otra}", i + 1)
        if k > 0:
            j = min(j, k)
    seg = texto[max(0, i - 40) : j].strip()
    return re.sub(r"[ \t]+", " ", seg)[:1500]


def sla_detalle(db: Session, ticket_id: int) -> dict | None:
    """Detalle de por que un ticket excede (o no) el SLA, con linea de tiempo."""
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        return None
    comp = cumplimiento_ticket(db, ticket)
    journals = list(
        db.execute(
            select(TicketJournal)
            .where(TicketJournal.ticket_id == ticket_id)
            .order_by(TicketJournal.created_on)
        ).scalars()
    )

    timeline = []
    if ticket.created_on:
        timeline.append(
            {
                "fecha": ticket.created_on,
                "tipo": "Creado",
                "autor": ticket.author,
                "detalle": ticket.status or "",
            }
        )
    if comp["primera_respuesta"]:
        first = journals[0] if journals else None
        timeline.append(
            {
                "fecha": comp["primera_respuesta"],
                "tipo": "Primera respuesta",
                "autor": first.author if first else None,
                "detalle": (first.notes or "")[:180] if first else "",
            }
        )
    if ticket.closed_on:
        timeline.append(
            {
                "fecha": ticket.closed_on,
                "tipo": "Cerrado",
                "autor": None,
                "detalle": ticket.status or "",
            }
        )

    def _hh(v):
        if v is None:
            return "—"
        return f"{round(v / 24, 1)} d" if v >= 48 else f"{v} h"

    sla_c = comp.get("sla_criticidad") or "—"
    motivos = []
    if comp["estado_respuesta"] == "excede":
        motivos.append(
            f"Respuesta: el contrato exige {_hh(comp['sla_respuesta_h'])} "
            f"(criticidad {sla_c}); el proveedor tardó "
            f"{_hh(comp['tiempo_respuesta_h'])} → brecha de "
            f"{_hh(round(comp['tiempo_respuesta_h'] - comp['sla_respuesta_h'], 1))}."
        )
    elif comp["estado_respuesta"] == "sin_dato" and comp["sla_respuesta_h"]:
        motivos.append(
            f"Sin primera respuesta registrada; el contrato exige "
            f"{_hh(comp['sla_respuesta_h'])} (criticidad {sla_c})."
        )
    if comp["estado_resolucion"] == "excede":
        motivos.append(
            f"Resolución: el contrato exige {_hh(comp['sla_resolucion_h'])} "
            f"(criticidad {sla_c}); el proveedor tardó "
            f"{_hh(comp['tiempo_resolucion_h'])} → brecha de "
            f"{_hh(round(comp['tiempo_resolucion_h'] - comp['sla_resolucion_h'], 1))}."
        )
    comp["motivo"] = " ".join(motivos) or "Dentro de los tiempos del contrato."
    comp["contrato_clausula"] = _sla_clausula(db, comp.get("sla_criticidad"))
    comp["timeline"] = timeline
    comp["journals"] = [
        {"fecha": j.created_on, "autor": j.author, "notas": j.notes}
        for j in journals
    ][:60]
    return comp


def sla_cumplimiento(db: Session, limite: int = 300) -> dict:
    _asegurar_slas(db)
    filas = list(
        db.execute(
            select(Ticket)
            .where(Ticket.status_is_closed.is_(False))
            .order_by(desc(Ticket.created_on).nullslast())
            .limit(limite)
        ).scalars()
    )
    items = [cumplimiento_ticket(db, t) for t in filas]
    return {
        "total": len(items),
        "exceden": sum(1 for it in items if it["estado"] == "excede"),
        "cumplen": sum(1 for it in items if it["estado"] == "cumple"),
        "sin_sla": sum(1 for it in items if it["estado"] == "n/a"),
        "items": items,
    }
