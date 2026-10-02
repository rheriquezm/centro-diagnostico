import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.connectors.yale import YaleClient, YaleError
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import SyncRun, YaleAccessRecord

logger = logging.getLogger("centro.yale_sync")


def _parse_dt(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def sync_yale(days: int | None = None) -> dict:
    db = SessionLocal()
    run = SyncRun(connector="yale", status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        client = YaleClient()
        homes = client.homes()
        if settings.YALE_HOME_ID:
            homes = [h for h in homes if str(h.get("homeId")) == settings.YALE_HOME_ID] or homes

        days = days or settings.YALE_SYNC_DAYS
        hoy = datetime.now(timezone.utc).date()
        total = nuevos = 0

        for home in homes:
            home_id = home.get("homeId")
            for offset in range(days):
                dia = hoy - timedelta(days=offset)
                for item in client.access_registers(home_id, dia):
                    total += 1
                    operation = _parse_dt(item.get("operationDateTime"))
                    user_name = (item.get("userName") or "")[:160]
                    existing = db.execute(
                        select(YaleAccessRecord).where(
                            YaleAccessRecord.device_id == item.get("deviceId"),
                            YaleAccessRecord.operation_datetime == operation,
                            YaleAccessRecord.status_id == item.get("statusId"),
                            YaleAccessRecord.user_name == user_name,
                        )
                    ).scalar_one_or_none()
                    if existing:
                        continue
                    db.add(
                        YaleAccessRecord(
                            home_id=home_id,
                            device_id=item.get("deviceId"),
                            device_description=(item.get("deviceDescription") or "")[:160],
                            category=item.get("category"),
                            operation_datetime=operation,
                            status_id=item.get("statusId"),
                            status_name=item.get("statusName"),
                            source_name=item.get("sourceName"),
                            reason_name=item.get("reasonName"),
                            user_name=user_name,
                            platform_name=item.get("platformName"),
                        )
                    )
                    nuevos += 1
            db.commit()

        run.status = "completed"
        run.items = nuevos
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("yale sync total=%s nuevos=%s hogares=%s", total, nuevos, len(homes))
        return {"total": total, "nuevos": nuevos, "hogares": len(homes)}
    except YaleError as exc:
        db.rollback()
        run.status = "error"
        run.error = str(exc)[:1000]
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("error sync yale: %s", exc)
        raise
    finally:
        db.close()
