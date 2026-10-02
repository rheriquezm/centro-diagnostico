"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarChart from "@/components/BarChart";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Summary = {
  errores_24h: number;
  errores_7d: number;
  errores_criticos: number;
  fingerprints_total: number;
  tickets_abiertos: number;
  tickets_cerrados: number;
  tickets_total: number;
  errores_sin_ticket: number;
  reincidencias: number;
  problemas_nuevos: number;
  correlaciones: number;
};

type SyncInfo = { started_at?: string; finished_at?: string; status?: string; items?: number } | null;

type SystemStatus = {
  database: { ok: boolean };
  connectors: {
    redmine: { configured: boolean; url: string; last_sync: SyncInfo };
    graylog: { configured: boolean; url: string; streams: string[]; last_sync: SyncInfo };
  };
  ai: { provider: string; configured: boolean };
};

type SchedulerStatus = {
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result: Record<string, unknown> | null;
};

type Trend = { series: Array<{ fecha: string; total: number }> };

const ACCESOS = [
  {
    href: "/graylog",
    title: "Graylog",
    desc: "Errores de aplicación agrupados por huella",
    color: "#007bff",
  },
  {
    href: "/redmine",
    title: "Redmine",
    desc: "Tickets de incidencias y requerimientos",
    color: "#2c8c3a",
  },
  {
    href: "/cerradura",
    title: "Cerradura Yale",
    desc: "Aperturas y cierres del dispositivo Yale",
    color: "#f6a500",
  },
  {
    href: "/accesos",
    title: "Control de Acceso",
    desc: "Eventos de acceso por puerta y usuario",
    color: "#7c3aed",
  },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sched, setSched] = useState<SchedulerStatus | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, st, sc, tr] = await Promise.all([
        api.get<Summary>("/api/dashboard/summary"),
        api.get<SystemStatus>("/api/system/status"),
        api.get<SchedulerStatus>("/api/scheduler/status"),
        api.get<Trend>("/api/dashboard/trend?days=7"),
      ]);
      setSummary(s);
      setStatus(st);
      setSched(sc);
      setTrend(tr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncNow() {
    setError(null);
    setMessage("Lanzando sincronización (Redmine + Graylog + análisis)…");
    try {
      await api.post("/api/scheduler/run-now", {});
      setMessage("Sincronización iniciada en segundo plano. La información se actualizará en breve.");
      setTimeout(load, 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  if (error) {
    return <div className="card text-gob-error">{error}</div>;
  }
  if (!summary || !sched) {
    return <p className="text-content-muted">Cargando dashboard…</p>;
  }

  const ultimaSync =
    status?.connectors.graylog.last_sync?.started_at ||
    status?.connectors.redmine.last_sync?.started_at ||
    null;

  const serieTendencia = (trend?.series || []).map((p) => {
    const [, mes, dia] = p.fecha.split("-");
    return { label: `${dia}/${mes}`, value: p.total };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-content">Dashboard</h2>
          <p className="text-sm text-content-muted">
            Estado general del sistema (datos reales de Graylog y Redmine).
          </p>
        </div>
        <button className="btn-primary" onClick={syncNow}>
          Sincronizar ahora
        </button>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Análisis
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACCESOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="card group flex flex-col gap-2 transition hover:border-gob-info hover:shadow-sm"
            >
              <span className="h-1.5 w-10 rounded-full" style={{ background: a.color }} />
              <span className="font-semibold text-content group-hover:text-gob-info">
                {a.title}
              </span>
              <span className="text-xs text-content-muted">{a.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Estado general
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Errores 24 h" value={summary.errores_24h} />
          <KpiCard label="Errores 7 días" value={summary.errores_7d} />
          <KpiCard label="Errores críticos" value={summary.errores_criticos} />
          <KpiCard label="Problemas (fingerprints)" value={summary.fingerprints_total} />
          <KpiCard label="Tickets abiertos" value={summary.tickets_abiertos} />
          <KpiCard label="Tickets cerrados" value={summary.tickets_cerrados} />
          <KpiCard label="Errores sin ticket" value={summary.errores_sin_ticket} />
          <KpiCard label="Posibles reincidencias" value={summary.reincidencias} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Distribución de tickets</p>
          <Donut
            centerLabel="Tickets"
            data={[
              { nombre: "Abiertos", total: summary.tickets_abiertos, color: "#f6a500" },
              { nombre: "Cerrados", total: summary.tickets_cerrados, color: "#2c8c3a" },
            ]}
          />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Errores por día (7 días)</p>
          <BarChart data={serieTendencia} color="#007bff" />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Automatización
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="card space-y-1">
            <p className="card-title">Última sincronización</p>
            <p className="text-lg font-semibold text-content">{formatDateTime(ultimaSync)}</p>
            <p className="text-xs text-content-muted">
              Scheduler: {sched.enabled ? "activo" : "desactivado"} · cada {sched.interval_minutes} min
            </p>
          </div>
          <div className="card space-y-1">
            <p className="card-title">Próxima ejecución</p>
            <p className="text-lg font-semibold text-content">{formatDateTime(sched.next_run_at)}</p>
            <p className="text-xs text-content-muted">Última corrida: {formatDateTime(sched.last_run_at)}</p>
          </div>
          <div className="card space-y-1">
            <p className="card-title">Redmine</p>
            <Badge tone={status?.connectors.redmine.configured ? "success" : "neutral"}>
              {status?.connectors.redmine.configured ? "Configurado" : "Sin configurar"}
            </Badge>
            <p className="text-xs text-content-muted">
              Última: {formatDateTime(status?.connectors.redmine.last_sync?.started_at)}
            </p>
          </div>
          <div className="card space-y-1">
            <p className="card-title">Graylog</p>
            <Badge tone={status?.connectors.graylog.configured ? "success" : "neutral"}>
              {status?.connectors.graylog.configured ? "Configurado" : "Sin configurar"}
            </Badge>
            <p className="text-xs text-content-muted">
              Última: {formatDateTime(status?.connectors.graylog.last_sync?.started_at)}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="card">
          <p className="font-medium text-content">Motor de IA</p>
          <p className="mt-1 text-sm text-content-muted">
            Proveedor: <strong>{status?.ai.provider}</strong>{" "}
            {status?.ai.configured ? "(activo)" : "(sin configurar)"}
          </p>
        </div>
      </section>
    </div>
  );
}
