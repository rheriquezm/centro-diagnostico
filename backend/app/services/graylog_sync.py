import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select

from app.connectors.graylog import GraylogClient
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import ErrorBucket, ErrorFingerprint, SyncRun
from app.services.fingerprint import build_fingerprint

logger = logging.getLogger("centro.graylog_sync")

SYSLOG_LEVELS = {
    0: "FATAL",
    1: "FATAL",
    2: "FATAL",
    3: "ERROR",
    4: "WARN",
    5: "INFO",
    6: "INFO",
    7: "DEBUG",
}
STORED_LEVELS = ("WARN", "ERROR", "FATAL")
LEVEL_RE = re.compile(r"\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b")
EXCEPTION_RE = re.compile(r"([A-Za-z_$][\w.$]*(?:Exception|Error|Throwable))")
TS_RE = re.compile(r"(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)")


def _parse_ts(value):
    if not value:
        return None
    match = TS_RE.search(str(value))
    raw = match.group(1) if match else str(value)
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _detect_level(fields: dict) -> str:
    level = fields.get("level")
    if isinstance(level, (int, float)):
        return SYSLOG_LEVELS.get(int(level), "INFO")
    text = str(fields.get("message") or "")
    match = LEVEL_RE.search(text)
    if match:
        value = match.group(1).upper()
        return "WARN" if value == "WARNING" else value
    return "INFO"


def _detect_exception(text: str) -> str | None:
    match = EXCEPTION_RE.search(text or "")
    return match.group(1) if match else None


def _application(fields: dict) -> str | None:
    for key in ("source_app", "application_name", "application", "log_tag"):
        if fields.get(key):
            return str(fields[key])
    return fields.get("source")


def _service(fields: dict) -> str | None:
    for key in ("log_tag", "service", "facility"):
        if fields.get(key):
            return str(fields[key])
    return None


def _floor_hour(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


def sync_graylog(
    query: str = "*",
    range_seconds: int | None = None,
    max_messages: int = 1000,
) -> dict:
    db = SessionLocal()
    run = SyncRun(connector="graylog", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        client = GraylogClient()
        range_seconds = range_seconds or settings.SYNC_LOOKBACK_HOURS * 3600
        if settings.graylog_streams:
            streams = " OR ".join(f'stream_id:"{s}"' for s in settings.graylog_streams)
            query = f"({query}) AND ({streams})" if query and query != "*" else streams

        existing = {
            fp.fingerprint: fp
            for fp in db.execute(select(ErrorFingerprint)).scalars().all()
        }
        buckets: dict[tuple, int] = {}
        total = considerados = nuevos = 0

        for item in client.iter_messages(
            query=query, range_seconds=range_seconds, max_messages=max_messages
        ):
            total += 1
            fields = item.get("message") or {}
            level = _detect_level(fields)
            if level not in STORED_LEVELS:
                continue
            considerados += 1

            timestamp = _parse_ts(fields.get("timestamp")) or datetime.now(timezone.utc)
            message = str(fields.get("message") or "")
            stack = str(fields.get("full_message") or message)
            application = _application(fields)
            service = _service(fields)
            exception_type = _detect_exception(message)

            result = build_fingerprint(
                application=application,
                service=service,
                message=message,
                stack=stack,
                exception_type=exception_type,
            )

            fp = existing.get(result.fingerprint)
            if fp is None:
                fp = ErrorFingerprint(fingerprint=result.fingerprint)
                db.add(fp)
                existing[result.fingerprint] = fp
                nuevos += 1

            fp.application = application
            fp.service = service
            fp.exception_type = exception_type or fp.exception_type
            fp.class_name = result.class_name or fp.class_name
            fp.method = result.method or fp.method
            fp.line = result.line if result.line is not None else fp.line
            fp.template = result.template or fp.template
            fp.severity = "ERROR" if level in ("ERROR", "FATAL") else fp.severity or "WARN"
            fp.first_seen = (
                timestamp
                if fp.first_seen is None or timestamp < fp.first_seen
                else fp.first_seen
            )
            fp.last_seen = (
                timestamp
                if fp.last_seen is None or timestamp > fp.last_seen
                else fp.last_seen
            )
            fp.occurrences_total = (fp.occurrences_total or 0) + 1
            if not fp.sample_message:
                fp.sample_message = message[:2000]
            if not fp.sample_stack:
                fp.sample_stack = stack[:4000]

            host = fields.get("source") or "n/d"
            key = (result.fingerprint, _floor_hour(timestamp), str(host))
            buckets[key] = buckets.get(key, 0) + 1

        db.commit()

        for (fingerprint, hour, host), count in buckets.items():
            fp = existing.get(fingerprint)
            if fp is None:
                continue
            existing_bucket = db.execute(
                select(ErrorBucket).where(
                    ErrorBucket.fingerprint_id == fp.id,
                    ErrorBucket.bucket_hour == hour,
                    ErrorBucket.host == host,
                )
            ).scalar_one_or_none()
            if existing_bucket:
                existing_bucket.count += count
            else:
                db.add(
                    ErrorBucket(
                        fingerprint_id=fp.id,
                        bucket_hour=hour,
                        host=host,
                        count=count,
                    )
                )
        db.commit()

        run.status = "completed"
        run.items = considerados
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "graylog sync total=%s errores=%s nuevos_fp=%s", total, considerados, nuevos
        )
        return {
            "total_mensajes": total,
            "errores_considerados": considerados,
            "fingerprints_nuevos": nuevos,
        }
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run.status = "error"
        run.error = str(exc)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("error sync graylog")
        raise
    finally:
        db.close()
