import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.connectors.zkbio import ZkbioClient, ZkbioError
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import SyncRun, ZkAccessRecord

logger = logging.getLogger("centro.zkbio_sync")


def _celda(row: list, index: int) -> str:
    if index < len(row) and row[index] is not None:
        return str(row[index]).strip()
    return ""


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _to_record(row: list) -> ZkAccessRecord | None:
    if not row:
        return None
    try:
        log_id = int(row[0])
    except (TypeError, ValueError, IndexError):
        return None
    return ZkAccessRecord(
        log_id=log_id,
        event_time=_parse_dt(_celda(row, 1)),
        area_name=_celda(row, 2)[:120] or None,
        device_name=_celda(row, 3)[:160] or None,
        event_point=_celda(row, 4)[:120] or None,
        event_name=_celda(row, 5)[:200] or None,
        pin=_celda(row, 8)[:40] or None,
        first_name=_celda(row, 9)[:160] or None,
        last_name=_celda(row, 10)[:160] or None,
        card_no=_celda(row, 11)[:60] or None,
        dept_name=_celda(row, 13)[:160] or None,
        reader_name=_celda(row, 14)[:160] or None,
        verify_mode=_celda(row, 15)[:60] or None,
    )


def sync_zkbio(days: int | None = None) -> dict:
    db = SessionLocal()
    run = SyncRun(connector="zkbio", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        days = days or settings.ZKBIO_SYNC_DAYS
        fin = datetime.now()
        inicio = fin - timedelta(days=days)

        client = ZkbioClient()
        rows = client.transactions(inicio, fin)

        # El grid repite registros y el log_id se reutiliza entre dispositivos:
        # la clave unica es (log_id, device_name, event_time).
        records: dict[tuple, ZkAccessRecord] = {}
        for row in rows:
            record = _to_record(row)
            if record is not None:
                records.setdefault(
                    (record.log_id, record.device_name, record.event_time), record
                )

        existentes: set[tuple] = set()
        ids = list({k[0] for k in records})
        for i in range(0, len(ids), 2000):
            chunk = ids[i : i + 2000]
            for lid, dname, etime in db.execute(
                select(
                    ZkAccessRecord.log_id,
                    ZkAccessRecord.device_name,
                    ZkAccessRecord.event_time,
                ).where(ZkAccessRecord.log_id.in_(chunk))
            ).all():
                existentes.add((lid, dname, etime))

        nuevos = 0
        for key, record in records.items():
            if key in existentes:
                continue
            db.add(record)
            nuevos += 1
        db.commit()

        run.status = "completed"
        run.items = nuevos
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "zkbio sync total=%s unicos=%s nuevos=%s dias=%s",
            len(rows),
            len(records),
            nuevos,
            days,
        )
        return {
            "total": len(rows),
            "unicos": len(records),
            "nuevos": nuevos,
            "dias": days,
        }
    except ZkbioError as exc:
        db.rollback()
        run.status = "error"
        run.error = str(exc)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("error sync zkbio: %s", exc)
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run.status = "error"
        run.error = str(exc)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.exception("error inesperado sync zkbio")
        raise
    finally:
        db.close()
