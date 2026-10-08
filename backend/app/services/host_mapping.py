from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import HostMapping


def get_mapping(db: Session) -> dict[str, str]:
    filas = db.execute(select(HostMapping)).scalars().all()
    return {f.graylog_host: (f.nagios_host or "") for f in filas}


def save_mapping(db: Session, mapping: dict[str, str]) -> dict[str, str]:
    existentes = {
        f.graylog_host: f for f in db.execute(select(HostMapping)).scalars().all()
    }
    for graylog_host, nagios_host in mapping.items():
        graylog_host = (graylog_host or "").strip()
        if not graylog_host:
            continue
        nagios_host = (nagios_host or "").strip() or None
        fila = existentes.get(graylog_host)
        if fila is None:
            db.add(HostMapping(graylog_host=graylog_host, nagios_host=nagios_host))
        else:
            fila.nagios_host = nagios_host
    db.commit()
    return get_mapping(db)
