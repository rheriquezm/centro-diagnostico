import hashlib
import re
from dataclasses import dataclass

# Elementos variables que se normalizan a placeholders.
_NORMALIZERS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"), "<UUID>"),
    (re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"), "<IP>"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "<EMAIL>"),
    (re.compile(r"\b0x[0-9a-fA-F]+\b"), "<HEX>"),
    (re.compile(r"\b[0-9a-fA-F]{16,}\b"), "<HEX>"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}[T ][\d:.,+-]+Z?\b"), "<TS>"),
    (re.compile(r"\b\d{2}:\d{2}:\d{2}[.,]?\d*\b"), "<TS>"),
    (re.compile(r"\b\d+\b"), "<NUM>"),
]

_FRAME_RE = re.compile(r"at\s+([\w$.]+)\.([\w$<>]+)\(([^():]+)(?::(\d+))?\)")


@dataclass
class FingerprintResult:
    fingerprint: str
    template: str
    exception_type: str | None
    class_name: str | None
    method: str | None
    line: int | None


def normalize_text(text: str | None) -> str:
    """Convierte un mensaje variable en un template estable."""
    if not text:
        return ""
    text = text.replace("#012", "\n")
    for pattern, replacement in _NORMALIZERS:
        text = pattern.sub(replacement, text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", " ", text)
    return text.strip()


def parse_location(stack: str | None) -> dict:
    """Extrae clase/metodo/archivo/linea del primer frame del stack trace."""
    if not stack:
        return {}
    normalized = stack.replace("#012", "\n")
    match = _FRAME_RE.search(normalized)
    if not match:
        return {}
    return {
        "class_name": match.group(1),
        "method": match.group(2),
        "file": match.group(3),
        "line": int(match.group(4)) if match.group(4) else None,
    }


def compute_fingerprint(
    application: str | None = None,
    service: str | None = None,
    exception_type: str | None = None,
    class_name: str | None = None,
    method: str | None = None,
    line: int | None = None,
    template: str | None = None,
) -> str:
    """Hash estable que agrupa errores equivalentes."""
    parts = [
        application,
        service,
        exception_type,
        class_name,
        method,
        str(line) if line is not None else None,
        (template or "")[:200],
    ]
    key = "|".join((part or "").lower() for part in parts)
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def build_fingerprint(
    application: str | None,
    service: str | None,
    message: str | None,
    stack: str | None,
    exception_type: str | None = None,
) -> FingerprintResult:
    """Pipeline completo: template + ubicacion + fingerprint."""
    template = normalize_text(message)
    location = parse_location(stack) or parse_location(message)
    fingerprint = compute_fingerprint(
        application=application,
        service=service,
        exception_type=exception_type,
        class_name=location.get("class_name"),
        method=location.get("method"),
        line=location.get("line"),
        template=template,
    )
    return FingerprintResult(
        fingerprint=fingerprint,
        template=template,
        exception_type=exception_type,
        class_name=location.get("class_name"),
        method=location.get("method"),
        line=location.get("line"),
    )
