from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


# --------------------------------------------------------------------------
# REDMINE
# --------------------------------------------------------------------------
class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    redmine_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    project_id: Mapped[int | None] = mapped_column(Integer, index=True)
    project_name: Mapped[str | None] = mapped_column(String(255), index=True)
    tracker: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str | None] = mapped_column(String(120), index=True)
    status_is_closed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    priority: Mapped[str | None] = mapped_column(String(120), index=True)
    category: Mapped[str | None] = mapped_column(String(160))
    author: Mapped[str | None] = mapped_column(String(255))
    assigned_to: Mapped[str | None] = mapped_column(String(255), index=True)
    subject: Mapped[str] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text)
    created_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    updated_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    closed_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    raw: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    journals: Mapped[list["TicketJournal"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )


class TicketJournal(Base):
    __tablename__ = "ticket_journals"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    journal_id: Mapped[int | None] = mapped_column(Integer)
    author: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ticket: Mapped[Ticket] = relationship(back_populates="journals")


class TicketRelation(Base):
    __tablename__ = "ticket_relations"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    relation_type: Mapped[str | None] = mapped_column(String(80))
    target_redmine_id: Mapped[int | None] = mapped_column(Integer, index=True)


# --------------------------------------------------------------------------
# GRAYLOG / FINGERPRINTS
# --------------------------------------------------------------------------
class ErrorFingerprint(Base):
    __tablename__ = "error_fingerprints"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    application: Mapped[str | None] = mapped_column(String(120), index=True)
    service: Mapped[str | None] = mapped_column(String(120), index=True)
    exception_type: Mapped[str | None] = mapped_column(String(200), index=True)
    logger: Mapped[str | None] = mapped_column(String(255))
    class_name: Mapped[str | None] = mapped_column(String(255))
    method: Mapped[str | None] = mapped_column(String(160))
    line: Mapped[int | None] = mapped_column(Integer)
    template: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="ERROR", index=True)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    occurrences_total: Mapped[int] = mapped_column(Integer, default=0)
    occurrences_24h: Mapped[int] = mapped_column(Integer, default=0)
    trend: Mapped[str | None] = mapped_column(String(20))
    sample_message: Mapped[str | None] = mapped_column(Text)
    sample_stack: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ErrorBucket(Base):
    __tablename__ = "error_buckets"
    __table_args__ = (
        UniqueConstraint("fingerprint_id", "bucket_hour", "host", name="uq_bucket"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint_id: Mapped[int] = mapped_column(
        ForeignKey("error_fingerprints.id", ondelete="CASCADE"), index=True
    )
    bucket_hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    host: Mapped[str | None] = mapped_column(String(120), index=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


# --------------------------------------------------------------------------
# CORRELACION / HALLAZGOS
# --------------------------------------------------------------------------
class Correlation(Base):
    __tablename__ = "correlations"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint_id: Mapped[int] = mapped_column(
        ForeignKey("error_fingerprints.id", ondelete="CASCADE"), index=True
    )
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[str | None] = mapped_column(String(40))
    evidence: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(30), index=True)
    fingerprint_id: Mapped[int | None] = mapped_column(
        ForeignKey("error_fingerprints.id", ondelete="SET NULL"), index=True
    )
    ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(512))
    detail: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(String(20), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# --------------------------------------------------------------------------
# CONOCIMIENTO / IA / SINCRONIZACION
# --------------------------------------------------------------------------
class KbEntry(Base):
    __tablename__ = "kb_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    problem: Mapped[str | None] = mapped_column(String(512))
    cause: Mapped[str | None] = mapped_column(Text)
    solution: Mapped[str | None] = mapped_column(Text)
    ticket_redmine_id: Mapped[int | None] = mapped_column(Integer)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AiDiagnosis(Base):
    __tablename__ = "ai_diagnoses"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint_id: Mapped[int | None] = mapped_column(
        ForeignKey("error_fingerprints.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    input_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    output: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    connector: Mapped[str] = mapped_column(String(30), index=True)
    status: Mapped[str] = mapped_column(String(20), default="running")
    items: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Pattern(Base):
    __tablename__ = "patterns"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    regex: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="classify")
    severity: Mapped[str | None] = mapped_column(String(20))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class YaleAccessRecord(Base):
    __tablename__ = "yale_access_records"
    __table_args__ = (
        UniqueConstraint(
            "device_id", "operation_datetime", "status_id", "user_name",
            name="uq_yale_record",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    home_id: Mapped[int | None] = mapped_column(Integer, index=True)
    device_id: Mapped[int | None] = mapped_column(Integer, index=True)
    device_description: Mapped[str | None] = mapped_column(String(160), index=True)
    category: Mapped[str | None] = mapped_column(String(60))
    operation_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    status_id: Mapped[int | None] = mapped_column(Integer)
    status_name: Mapped[str | None] = mapped_column(String(40), index=True)
    source_name: Mapped[str | None] = mapped_column(String(80))
    reason_name: Mapped[str | None] = mapped_column(String(120))
    user_name: Mapped[str | None] = mapped_column(String(160), index=True)
    platform_name: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ZkAccessRecord(Base):
    """Transacciones de acceso de ZKBio CVAccess (ZKTeco).

    La hora se guarda como fecha/hora local del controlador (naive) para que el
    navegador la muestre tal cual la reporta el equipo.

    Nota: el ``log_id`` NO es unico global (se repite entre dispositivos), por eso
    la unicidad es compuesta por (log_id, device_name, event_time).
    """

    __tablename__ = "zk_access_records"
    __table_args__ = (
        UniqueConstraint(
            "log_id", "device_name", "event_time", name="uq_zk_record"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    log_id: Mapped[int] = mapped_column(BigInteger, index=True)
    event_time: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    area_name: Mapped[str | None] = mapped_column(String(120), index=True)
    device_name: Mapped[str | None] = mapped_column(String(160), index=True)
    event_point: Mapped[str | None] = mapped_column(String(120))
    event_name: Mapped[str | None] = mapped_column(String(200), index=True)
    pin: Mapped[str | None] = mapped_column(String(40), index=True)
    first_name: Mapped[str | None] = mapped_column(String(160), index=True)
    last_name: Mapped[str | None] = mapped_column(String(160))
    card_no: Mapped[str | None] = mapped_column(String(60), index=True)
    dept_name: Mapped[str | None] = mapped_column(String(160), index=True)
    reader_name: Mapped[str | None] = mapped_column(String(160))
    verify_mode: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class HostMapping(Base):
    """Equivalencia de nombre de host Graylog <-> Nagios (analisis cruzado)."""

    __tablename__ = "host_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    graylog_host: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    nagios_host: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
