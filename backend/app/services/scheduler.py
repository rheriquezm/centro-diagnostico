import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from app.core.config import settings

logger = logging.getLogger("centro.scheduler")

_started = False
_lock = threading.Lock()
_state: dict = {
    "started_at": None,
    "last_run_at": None,
    "next_run_at": None,
    "last_result": None,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _set(**kwargs) -> None:
    with _lock:
        _state.update(kwargs)


def get_state() -> dict:
    with _lock:
        return dict(_state)


def run_cycle() -> dict:
    """Sincroniza Redmine y Graylog y corre el pipeline."""
    result: dict = {}

    if settings.REDMINE_API_KEY:
        try:
            from app.services.redmine_sync import sync_tickets

            result["redmine"] = sync_tickets(max_issues=settings.REDMINE_SYNC_MAX_ISSUES)
        except Exception as exc:  # noqa: BLE001
            logger.exception("fallo sync redmine")
            result["redmine"] = {"error": str(exc)[:200]}

    if settings.GRAYLOG_USER or settings.GRAYLOG_API_TOKEN:
        try:
            from app.services.graylog_sync import sync_graylog

            result["graylog"] = sync_graylog(
                query=settings.GRAYLOG_SYNC_QUERY,
                range_seconds=settings.GRAYLOG_SYNC_RANGE_HOURS * 3600,
                max_messages=settings.GRAYLOG_SYNC_MAX_MESSAGES,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("fallo sync graylog")
            result["graylog"] = {"error": str(exc)[:200]}

    if settings.YALE_EMAIL and settings.YALE_PASSWORD:
        try:
            from app.services.yale_sync import sync_yale

            result["yale"] = sync_yale(settings.YALE_SYNC_DAYS)
        except Exception as exc:  # noqa: BLE001
            logger.exception("fallo sync yale")
            result["yale"] = {"error": str(exc)[:200]}

    if settings.ZKBIO_USERNAME and settings.ZKBIO_PASSWORD:
        try:
            from app.services.zkbio_sync import sync_zkbio

            result["zkbio"] = sync_zkbio(settings.ZKBIO_SYNC_DAYS)
        except Exception as exc:  # noqa: BLE001
            logger.exception("fallo sync zkbio")
            result["zkbio"] = {"error": str(exc)[:200]}

    try:
        from app.services.correlation import run_correlation
        from app.services.findings import run_findings

        result["correlaciones"] = run_correlation()
        result["hallazgos"] = run_findings()
    except Exception as exc:  # noqa: BLE001
        logger.exception("fallo pipeline")
        result["pipeline"] = {"error": str(exc)[:200]}

    return result


def run_cycle_tracked() -> dict:
    """Igual que run_cycle pero registrando estado (ultima/proxima ejecucion)."""
    interval_seconds = max(5, settings.SYNC_INTERVAL_MINUTES) * 60
    _set(last_run_at=_now())
    try:
        result = run_cycle()
        _set(last_result=result)
        return result
    finally:
        _set(next_run_at=_now() + timedelta(seconds=interval_seconds))


def _loop() -> None:
    interval_seconds = max(5, settings.SYNC_INTERVAL_MINUTES) * 60
    _set(next_run_at=_now() + timedelta(seconds=interval_seconds))
    logger.info("scheduler iniciado (cada %s min)", settings.SYNC_INTERVAL_MINUTES)
    while True:
        time.sleep(interval_seconds)
        try:
            logger.info("scheduler: ejecutando ciclo programado")
            result = run_cycle_tracked()
            logger.info("scheduler: ciclo completado %s", result)
        except Exception:  # noqa: BLE001
            logger.exception("scheduler: error en el ciclo")


def start_scheduler() -> None:
    global _started
    if _started or not settings.SCHEDULER_ENABLED:
        return
    _set(started_at=_now())
    thread = threading.Thread(target=_loop, name="cd-scheduler", daemon=True)
    thread.start()
    _started = True
