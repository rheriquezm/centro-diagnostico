"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarChart from "@/components/BarChart";
import BarList from "@/components/BarList";
import ConnectorStatusBar from "@/components/ConnectorStatusBar";
import Donut from "@/components/Donut";
import Gauge from "@/components/Gauge";
import Heatmap from "@/components/Heatmap";
import KpiCard from "@/components/KpiCard";
import SourceCard from "@/components/SourceCard";
import StackedBar from "@/components/StackedBar";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useConnections } from "@/lib/useConnections";

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

type GraylogRes = {
  total: number;
  ocurrencias: number;
  criticos: number;
  por_severidad: { nombre: string; total: number }[];
};
type RedmineRes = { total: number; abiertos: number; cerrados: number };
type YaleRes = { total: number; aperturas: number; cierres: number };
type ZkRes = {
  total: number;
  aperturas: number;
  denegados: number;
  por_dispositivo: { nombre: string; total: number }[];
  por_hora: Array<{ hora: number; total: number }>;
  por_evento: { nombre: string; total: number }[];
};
type NagiosRes = {
  problemas: number;
  hosts_total: number;
  services_total: number;
  host_counts: Record<string, number>;
  service_counts: Record<string, number>;
};
type CentinelaRes = {
  stats: {
    total: number;
    afectan: number;
    urgentes: number;
    kev: number;
    actualizaciones: number;
    inventario: number;
  };
  last_sync?: string | null;
};

type HeatmapRes = { dias: number; max: number; total: number; grid: number[][] };

type Fuentes = {
  graylog?: GraylogRes;
  redmine?: RedmineRes;
  yale?: YaleRes;
  zk?: ZkRes;
  nagios?: NagiosRes;
  centinela?: CentinelaRes;
};

function serieHorasZk(items: Array<{ hora: number; total: number }>) {
  const map = new Map(items.map((i) => [i.hora, i.total]));
  return Array.from({ length: 24 }, (_, h) => ({ label: h, value: map.get(h) || 0 }));
}

function tipoEventoZk(items: Array<{ nombre: string; total: number }>) {
  const ordenado = [...items].sort((a, b) => b.total - a.total);
  const top = ordenado.slice(0, 5);
  const resto = ordenado.slice(5).reduce((acc, i) => acc + i.total, 0);
  return resto > 0 ? [...top, { nombre: "Otros", total: resto }] : top;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sched, setSched] = useState<SchedulerStatus | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data: conn } = useConnections();
  const [fuentes, setFuentes] = useState<Fuentes>({});
  const [heatmap, setHeatmap] = useState<HeatmapRes | null>(null);

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

  const loadFuentes = useCallback(async () => {
    const [g, r, y, z, n, h, c] = await Promise.allSettled([
      api.get<GraylogRes>("/api/graylog/resumen"),
      api.get<RedmineRes>("/api/redmine/resumen"),
      api.get<YaleRes>("/api/yale/resumen?dias=7"),
      api.get<ZkRes>("/api/zkbio/resumen?horas=24"),
      api.get<NagiosRes>("/api/nagios/summary"),
      api.get<HeatmapRes>("/api/zkbio/heatmap?dias=7"),
      api.get<CentinelaRes>("/api/centinela/summary"),
    ]);
    setFuentes({
      graylog: g.status === "fulfilled" ? g.value : undefined,
      redmine: r.status === "fulfilled" ? r.value : undefined,
      yale: y.status === "fulfilled" ? y.value : undefined,
      zk: z.status === "fulfilled" ? z.value : undefined,
      nagios: n.status === "fulfilled" ? n.value : undefined,
      centinela: c.status === "fulfilled" ? c.value : undefined,
    });
    setHeatmap(h.status === "fulfilled" ? h.value : null);
  }, []);

  useEffect(() => {
    loadFuentes();
    const id = setInterval(loadFuentes, 120000);
    return () => clearInterval(id);
  }, [loadFuentes]);

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

  const pctTickets =
    summary.tickets_total > 0
      ? (summary.tickets_cerrados / summary.tickets_total) * 100
      : 0;

  const nagiosHosts = fuentes.nagios?.host_counts || {};
  const nagiosSvc = fuentes.nagios?.service_counts || {};
  const hostsTotal = fuentes.nagios?.hosts_total || 0;
  const pctHostsUp = hostsTotal > 0 ? ((nagiosHosts.UP || 0) / hostsTotal) * 100 : 0;

  const zkTotal = fuentes.zk?.total || 0;
  const pctIdent =
    zkTotal > 0 ? ((zkTotal - (fuentes.zk?.denegados || 0)) / zkTotal) * 100 : 0;

  const hostSegs = [
    { nombre: "UP", total: nagiosHosts.UP || 0, color: "#2c8c3a" },
    { nombre: "PENDING", total: nagiosHosts.PENDING || 0, color: "#f6a500" },
    { nombre: "DOWN", total: nagiosHosts.DOWN || 0, color: "#d93025" },
    { nombre: "UNREACHABLE", total: nagiosHosts.UNREACHABLE || 0, color: "#b91c1c" },
  ];
  const svcSegs = [
    { nombre: "OK", total: nagiosSvc.OK || 0, color: "#2c8c3a" },
    { nombre: "WARNING", total: nagiosSvc.WARNING || 0, color: "#f6a500" },
    { nombre: "CRITICAL", total: nagiosSvc.CRITICAL || 0, color: "#d93025" },
    { nombre: "UNKNOWN", total: nagiosSvc.UNKNOWN || 0, color: "#007bff" },
  ];
  const SEV_COLORS: Record<string, string> = {
    ERROR: "#d93025",
    FATAL: "#b91c1c",
    CRITICAL: "#b91c1c",
    WARN: "#f6a500",
    WARNING: "#f6a500",
    INFO: "#007bff",
  };
  const sevSegs = (fuentes.graylog?.por_severidad || []).map((s) => ({
    nombre: s.nombre,
    total: s.total,
    color: SEV_COLORS[s.nombre] || "#64748b",
  }));

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <span className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-gob-blue opacity-10" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-content">
              Centro de Diagnóstico
            </h2>
            <p className="text-sm text-content-muted">
              Monitoreo, correlación y análisis con IA · Graylog · Redmine ·
              Cerradura Yale · Control de Acceso · Nagios · Actualizaciones
            </p>
          </div>
          <button className="btn-primary" onClick={syncNow}>
            Sincronizar ahora
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill">
            <span
              className={`h-2 w-2 rounded-full ${
                status?.database.ok ? "bg-gob-success" : "bg-gob-error"
              }`}
            />
            Base de datos {status?.database.ok ? "OK" : "con error"}
          </span>
          <span className="pill">
            <span
              className={`h-2 w-2 rounded-full ${
                sched.enabled ? "bg-gob-success" : "bg-content-muted/40"
              }`}
            />
            Scheduler {sched.enabled ? "activo" : "off"} · cada{" "}
            {sched.interval_minutes} min
          </span>
          <span className="pill">Última sync: {formatDateTime(ultimaSync)}</span>
          <span className="pill">IA: {status?.ai.provider || "—"}</span>
        </div>
      </section>

      {message ? <div className="card text-gob-info">{message}</div> : null}

      <section>
        <h3 className="section-title">
          Fuentes de análisis
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SourceCard
            href="/graylog"
            title="Graylog"
            color="#007bff"
            value={fuentes.graylog?.total ?? "—"}
            label="Problemas (fingerprints)"
            secondary={
              fuentes.graylog
                ? `${fuentes.graylog.criticos} críticos · ${fuentes.graylog.ocurrencias} ocurrencias`
                : "Sin datos"
            }
            tone={(fuentes.graylog?.criticos ?? 0) > 0 ? "warn" : "ok"}
            toneText="Errores críticos registrados"
          />
          <SourceCard
            href="/redmine"
            title="Redmine"
            color="#2c8c3a"
            value={fuentes.redmine?.abiertos ?? "—"}
            label="Tickets abiertos"
            secondary={
              fuentes.redmine
                ? `${fuentes.redmine.total} total · ${fuentes.redmine.cerrados} cerrados`
                : "Sin datos"
            }
            tone="neutral"
          />
          <SourceCard
            href="/cerradura"
            title="Cerradura Yale"
            color="#f6a500"
            value={fuentes.yale?.aperturas ?? "—"}
            label="Aperturas (7 días)"
            secondary={fuentes.yale ? `${fuentes.yale.total} registros` : "Sin datos"}
            tone="ok"
          />
          <SourceCard
            href="/accesos"
            title="Control de Acceso"
            color="#7c3aed"
            value={fuentes.zk?.total ?? "—"}
            label="Eventos (24 h)"
            secondary={
              fuentes.zk ? `${fuentes.zk.denegados} no registrados` : "Sin datos"
            }
            tone={(fuentes.zk?.denegados ?? 0) > 0 ? "warn" : "ok"}
            toneText="Intentos de usuarios no registrados"
          />
          <SourceCard
            href="/nagios"
            title="Nagios"
            color="#d93025"
            value={fuentes.nagios?.problemas ?? "—"}
            label="Alertas activas"
            secondary={
              fuentes.nagios
                ? `${fuentes.nagios.hosts_total} hosts · ${fuentes.nagios.services_total} servicios`
                : "Sin datos"
            }
            tone={(fuentes.nagios?.problemas ?? 0) > 0 ? "error" : "ok"}
            toneText="Hosts/servicios con problemas"
          />
          <SourceCard
            href="/actualizaciones"
            title="Actualizaciones"
            color="#0891b2"
            value={fuentes.centinela?.stats.urgentes ?? "—"}
            label="Urgentes (CVE)"
            secondary={
              fuentes.centinela
                ? `${fuentes.centinela.stats.total} hallazgos · ${fuentes.centinela.stats.afectan} te afectan`
                : "Sin datos"
            }
            tone={
              !fuentes.centinela
                ? "neutral"
                : (fuentes.centinela.stats.urgentes ?? 0) > 0
                ? "error"
                : "ok"
            }
            toneText="Actualizaciones urgentes y CVEs"
          />
        </div>
      </section>

      <section>
        <h3 className="section-title">
          Estado general
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Errores 24 h" value={summary.errores_24h} accent="#d93025" />
          <KpiCard label="Errores 7 días" value={summary.errores_7d} accent="#f6a500" />
          <KpiCard label="Errores críticos" value={summary.errores_criticos} accent="#b91c1c" />
          <KpiCard
            label="Problemas (fingerprints)"
            value={summary.fingerprints_total}
            accent="#007bff"
          />
          <KpiCard label="Tickets abiertos" value={summary.tickets_abiertos} accent="#f6a500" />
          <KpiCard label="Tickets cerrados" value={summary.tickets_cerrados} accent="#2c8c3a" />
          <KpiCard
            label="Errores sin ticket"
            value={summary.errores_sin_ticket}
            accent="#7c3aed"
          />
          <KpiCard
            label="Posibles reincidencias"
            value={summary.reincidencias}
            accent="#ef3340"
          />
        </div>
      </section>

      <section>
        <h3 className="section-title">
          Salud general
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card flex justify-center">
            <Gauge
              value={pctTickets}
              label="Tickets resueltos"
              sublabel={`${summary.tickets_cerrados} de ${summary.tickets_total}`}
              color="#2c8c3a"
            />
          </div>
          <div className="card flex justify-center">
            <Gauge
              value={pctHostsUp}
              label="Hosts operativos"
              sublabel={`${nagiosHosts.UP || 0} de ${hostsTotal} hosts`}
              color="#007bff"
            />
          </div>
          <div className="card flex justify-center">
            <Gauge
              value={pctIdent}
              label="Accesos identificados"
              sublabel={`${fuentes.zk?.denegados ?? 0} no registrados (24 h)`}
              color="#7c3aed"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="section-title">
          Distribuciones
        </h3>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card">
            <p className="mb-3 font-medium text-content">Hosts (Nagios)</p>
            <StackedBar segments={hostSegs} />
          </div>
          <div className="card">
            <p className="mb-3 font-medium text-content">Servicios (Nagios)</p>
            <StackedBar segments={svcSegs} />
          </div>
          <div className="card">
            <p className="mb-3 font-medium text-content">Graylog por severidad</p>
            <StackedBar segments={sevSegs} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="section-title">
          Estado de conexiones
        </h3>
        <div className="space-y-3">
          {["graylog", "redmine", "yale", "zkbio", "nagios"].map((key) => (
            <ConnectorStatusBar key={key} info={conn?.connectors?.[key]} />
          ))}
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
        <h3 className="section-title">
          Mapa de actividad de accesos
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <p className="mb-4 font-medium text-content">
              Mapa de calor · accesos por día y hora (7 días)
            </p>
            {heatmap ? (
              <Heatmap grid={heatmap.grid} max={heatmap.max} />
            ) : (
              <p className="text-sm text-content-muted">Sin datos.</p>
            )}
          </div>
          <div className="card">
            <p className="mb-4 font-medium text-content">Tráfico por hora (24 h)</p>
            <BarChart
              data={serieHorasZk(fuentes.zk?.por_hora || [])}
              color="#7c3aed"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <p className="mb-4 font-medium text-content">Actividad por dispositivo</p>
          <BarList colorful items={fuentes.zk?.por_dispositivo || []} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Tipos de evento (accesos 24 h)</p>
          <Donut
            centerLabel="Eventos"
            data={tipoEventoZk(fuentes.zk?.por_evento || [])}
          />
        </div>
      </section>

      <section>
        <h3 className="section-title">
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
