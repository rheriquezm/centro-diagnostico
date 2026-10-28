"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Badge from "@/components/Badge";
import CentinelaPlanModal, { PlanService } from "@/components/CentinelaPlanModal";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Finding = {
  id: string;
  activo: string;
  version_instalada: string;
  version_disponible: string;
  cve: string;
  cvss: number | null;
  prioridad: number | null;
  nivel: string;
  impacto: string;
  kev: boolean;
  severidad: string;
  resumen: string;
  url: string;
  fecha: string;
};

type UpdateItem = {
  id: string;
  software: string;
  instalada: string;
  disponible: string;
  criticidad: number | null;
  eol: string;
  nota: string;
};

type InventoryItem = {
  nombre: string;
  version: string;
  criticidad: number | null;
  entorno: string;
  host?: string;
  ip?: string;
  os?: string;
  role?: string;
  port?: number | null;
  eol: string;
};

type Machine = {
  hostname?: string;
  ip?: string;
  os?: string;
  arch?: string;
  cpus?: number | null;
  memory_gb?: number | null;
  uptime_seconds?: number | null;
};

type HostItem = {
  host: string;
  ip: string;
  os: string;
  entorno: string;
  servicios: string[];
  hallazgos: number;
  urgentes: number;
  actualizaciones: number;
};

type Summary = {
  ok: boolean;
  url: string;
  public_url?: string;
  last_sync?: string | null;
  sync_status?: string | null;
  sources?: Record<string, string>;
  health?: {
    uptime?: number;
    lastSyncAt?: string;
    last_sync_at?: string;
  };
  stats: {
    total: number;
    afectan: number;
    urgentes: number;
    kev: number;
    actualizaciones: number;
    inventario: number;
  };
  findings: Finding[];
  updates: UpdateItem[];
  inventory: InventoryItem[];
  machine?: Machine;
  hosts?: HostItem[];
  inventory_mode?: string;
  watch: string[];
};

const NIVEL_TONE: Record<string, string> = {
  "Actuar ya": "error",
  Alta: "warning",
  Media: "info",
  "Puede esperar": "success",
  Informativa: "neutral",
};

const NIVEL_COLOR: Record<string, string> = {
  "Actuar ya": "#d93025",
  Alta: "#f6a500",
  Media: "#007bff",
  "Puede esperar": "#2c8c3a",
  Informativa: "#64748b",
};

const IMPACTO: Record<string, string> = {
  confirmed: "Te afecta",
  affected: "Te afecta",
  likely: "Probable",
  possible: "Posible",
  watch: "Vigilar",
  context: "Contexto",
};

const SYNC_LABEL: Record<string, string> = {
  completed: "Sincronizado",
  local: "Datos base",
  running: "Sincronizando…",
};

const NIVELES = ["Todas", "Actuar ya", "Alta", "Media", "Puede esperar", "Informativa"];

function criticidadTone(n: number | null): string {
  if (n === null) return "neutral";
  if (n >= 5) return "error";
  if (n >= 4) return "warning";
  return "success";
}

export default function ActualizacionesPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [nivel, setNivel] = useState("Todas");
  const [soloKev, setSoloKev] = useState(false);
  const [soloAfecta, setSoloAfecta] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [planService, setPlanService] = useState<PlanService | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("cd_theme");
    setTheme(stored === "dark" ? "dark" : "light");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<Summary>("/api/centinela/summary");
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar Centinela");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const findings = data?.findings || [];

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const finding of findings) {
      result[finding.nivel] = (result[finding.nivel] || 0) + 1;
    }
    return result;
  }, [findings]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return findings.filter((f) => {
      if (nivel !== "Todas" && f.nivel !== nivel) return false;
      if (soloKev && !f.kev) return false;
      if (soloAfecta && !["confirmed", "affected"].includes(f.impacto)) return false;
      if (term) {
        const haystack = `${f.activo} ${f.cve} ${f.resumen}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [findings, q, nivel, soloKev, soloAfecta]);

  async function syncNow() {
    setSyncing(true);
    setMessage("Sincronizando Centinela… puede tardar hasta 1 minuto.");
    try {
      await api.post("/api/centinela/sync", {});
      [5000, 15000, 30000, 50000].forEach((ms) => setTimeout(load, ms));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la sincronización");
    } finally {
      setTimeout(() => setSyncing(false), 5000);
      setTimeout(() => setMessage(null), 60000);
    }
  }

  function openPlan(
    software: string,
    installed?: string,
    available?: string,
    cve?: string
  ) {
    const inv = data?.inventory.find(
      (item) => item.nombre.toLowerCase() === software.toLowerCase()
    );
    setPlanService({
      host: inv?.host || data?.machine?.hostname,
      ip: inv?.ip || data?.machine?.ip,
      os: inv?.os || data?.machine?.os,
      software,
      installed,
      available,
      criticality: inv?.criticidad ?? null,
      eol: inv?.eol,
      cve,
    });
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="card">
          <h2 className="text-xl font-semibold text-content">
            Actualizaciones y alertas de seguridad
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Fuente: Centinela (monitor de actualizaciones y CVE).
          </p>
        </div>
        <div className="card space-y-3">
          <p className="font-medium text-gob-error">No se pudo consultar Centinela</p>
          <p className="text-sm text-content">{error}</p>
          <div className="rounded-lg bg-surface-soft p-3 text-sm text-content-muted">
            <p className="font-medium text-content">Cómo habilitarlo</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>El servicio local se levanta con <code>docker compose up -d centinela</code>.</li>
              <li>Verifica que el contenedor <code>cd_centinela</code> esté en ejecución.</li>
              <li>La URL se configura con <code>CENTINELA_URL</code> (por defecto <code>http://centinela:4310</code>).</li>
            </ul>
          </div>
          <button className="btn-primary" onClick={load}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-content-muted">Consultando Centinela…</p>;
  }

  const lastSync =
    data.last_sync || data.health?.lastSyncAt || data.health?.last_sync_at || null;
  const panelBase = (data.public_url || "http://localhost:4310").replace(/\/$/, "");
  const panelSrc = `${panelBase}/?embed=1&theme=${theme}`;
  const syncLabel = SYNC_LABEL[data.sync_status || ""] || data.sync_status || "—";
  const fuentes = Object.entries(data.sources || {});
  const hosts = data.hosts || [];

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <span className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-gob-info opacity-10" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-content">
              Actualizaciones y alertas de seguridad
            </h2>
            <p className="text-sm text-content-muted">
              Qué te afecta, qué actualizar y qué es urgente · datos de Centinela en tu equipo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={syncNow} disabled={syncing}>
              {syncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => setShowPanel((value) => !value)}
            >
              {showPanel ? "Cerrar Centinela" : "Abrir Centinela"}
            </button>
            <button className="btn-ghost" onClick={load} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill">
            <span
              className={`mr-1 inline-block h-2 w-2 rounded-full ${
                data.sync_status === "running"
                  ? "bg-gob-warning"
                  : "bg-gob-success"
              }`}
            />
            {syncLabel}
          </span>
          <span className="pill">Última sincronización: {formatDateTime(lastSync)}</span>
          <span className="pill">Panel: {panelBase}</span>
          {typeof data.health?.uptime === "number" ? (
            <span className="pill">En línea: {Math.floor(data.health.uptime / 3600)} h</span>
          ) : null}
        </div>
      </section>

      {message ? <div className="card text-gob-info">{message}</div> : null}

      {showPanel ? (
        <section className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
            <div>
              <p className="font-medium text-content">Panel de Centinela</p>
              <p className="text-xs text-content-muted">
                Integrado en esta página · {panelBase}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setPanelKey((k) => k + 1)}>
                Recargar
              </button>
              <button className="btn-ghost" onClick={() => setShowPanel(false)}>
                Cerrar
              </button>
            </div>
          </div>
          <iframe
            key={panelKey}
            src={panelSrc}
            title="Panel de Centinela"
            style={{ height: "78vh" }}
            className="w-full bg-surface"
          />
        </section>
      ) : null}

      <section>
        <h3 className="section-title">Resumen</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="Hallazgos" value={data.stats.total} accent="#0891b2" />
          <KpiCard label="Te afecta" value={data.stats.afectan} accent="#d93025" />
          <KpiCard label="Urgentes" value={data.stats.urgentes} accent="#f6a500" />
          <KpiCard label="Explotadas (KEV)" value={data.stats.kev} accent="#b91c1c" />
          <KpiCard label="Actualizaciones" value={data.stats.actualizaciones} accent="#2c8c3a" />
        </div>
      </section>

      <section>
        <h3 className="section-title">Máquinas y servicios</h3>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-content">
                Equipo donde corre Centinela
              </p>
              <p className="text-xs text-content-muted">
                Este equipo ejecuta el monitor; no implica que los servicios estén
                instalados aquí.
              </p>
            </div>
            <Badge tone="success">Monitor en línea</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-content-muted">Host</p>
              <p className="text-sm font-medium text-content">
                {data.machine?.hostname || "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-content-muted">IP</p>
              <p className="font-mono text-sm text-content">{data.machine?.ip || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-content-muted">
                Sistema operativo
              </p>
              <p className="text-sm text-content">{data.machine?.os || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-content-muted">
                Recursos
              </p>
              <p className="text-sm text-content">
                {data.machine?.cpus ?? "—"} vCPU · {data.machine?.memory_gb ?? "—"} GB
              </p>
            </div>
          </div>
        </div>

        <div className="card mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-content">
                Máquinas monitoreadas ({hosts.length})
              </p>
              <p className="text-xs text-content-muted">
                Inventario declarado: Centinela cruza estos servicios con fuentes
                públicas; no escanea la red.
              </p>
            </div>
            <Badge tone="neutral">
              {data.inventory_mode === "declarado"
                ? "Inventario declarado"
                : data.inventory_mode || "Declarado"}
            </Badge>
          </div>
          {hosts.length === 0 ? (
            <p className="mt-3 text-sm text-content-muted">
              Sin máquinas declaradas.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {hosts.map((h) => (
                <div
                  key={`${h.host}-${h.ip}`}
                  className="rounded-lg border border-surface-border bg-surface-soft/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-content">
                      {h.host || "—"}
                    </span>
                    <span className="font-mono text-xs text-content-muted">
                      {h.ip || "—"}
                    </span>
                  </div>
                  <p className="text-xs text-content-muted">
                    {h.os || "—"}
                    {h.entorno ? ` · ${h.entorno}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.servicios.map((servicio) => (
                      <span key={servicio} className="pill">
                        {servicio}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                    <span>{h.hallazgos} hallazgos</span>
                    <span className={h.urgentes > 0 ? "text-gob-warning" : ""}>
                      {h.urgentes} urgentes
                    </span>
                    <span>{h.actualizaciones} actualizaciones</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-content-muted">
                <th className="pb-2 pr-3 font-semibold">Host</th>
                <th className="pb-2 pr-3 font-semibold">IP</th>
                <th className="pb-2 pr-3 font-semibold">SO</th>
                <th className="pb-2 pr-3 font-semibold">Servicio</th>
                <th className="pb-2 pr-3 font-semibold">Instalada</th>
                <th className="pb-2 pr-3 font-semibold">Disponible</th>
                <th className="pb-2 pr-3 font-semibold">Criticidad</th>
                <th className="pb-2 pr-3 font-semibold">EOL</th>
                <th className="pb-2 font-semibold">Plan</th>
              </tr>
            </thead>
            <tbody>
              {data.inventory.map((item) => {
                const update = data.updates.find(
                  (u) => u.software === item.nombre
                );
                return (
                  <tr
                    key={item.nombre}
                    className="border-t border-surface-border align-top"
                  >
                    <td className="py-2 pr-3 text-content">{item.host || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-content">
                      {item.ip || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-content-muted">
                      {item.os || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-content">{item.nombre}</span>
                      <p className="text-xs text-content-muted">
                        {item.role || "—"}
                        {item.port ? ` · :${item.port}` : ""}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-content">{item.version || "—"}</td>
                    <td className="py-2 pr-3 text-gob-success">
                      {update?.disponible || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={criticidadTone(item.criticidad)}>
                        {item.criticidad ?? "—"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-content-muted">
                      {item.eol || "—"}
                    </td>
                    <td className="py-2">
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          openPlan(item.nombre, item.version, update?.disponible, "")
                        }
                      >
                        Pasos
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="section-title">Alertas y prioridad</h3>
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar por software, CVE o texto…"
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-content outline-none focus:border-gob-info md:w-80"
            />
            <label className="flex items-center gap-2 text-sm text-content">
              <input
                type="checkbox"
                checked={soloKev}
                onChange={(event) => setSoloKev(event.target.checked)}
              />
              Solo KEV
            </label>
            <label className="flex items-center gap-2 text-sm text-content">
              <input
                type="checkbox"
                checked={soloAfecta}
                onChange={(event) => setSoloAfecta(event.target.checked)}
              />
              Solo “te afecta”
            </label>
            <span className="ml-auto text-xs text-content-muted">
              {filtered.length} de {findings.length}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {NIVELES.map((option) => {
              const active = nivel === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setNivel(option)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-gob-blue text-white"
                      : "border border-surface-border text-content hover:bg-surface-soft"
                  }`}
                >
                  {option}
                  {option !== "Todas" ? ` (${counts[option] || 0})` : ""}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-content-muted">
                No hay hallazgos con estos filtros.
              </p>
            ) : (
              filtered.slice(0, 30).map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-y border-r border-surface-border bg-surface-soft/40 p-3"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                    borderLeftColor: NIVEL_COLOR[f.nivel] || "#64748b",
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={NIVEL_TONE[f.nivel] || "neutral"}>{f.nivel}</Badge>
                      {f.kev ? <Badge tone="error">KEV</Badge> : null}
                      {f.cvss !== null ? (
                        <span className="text-xs text-content-muted">
                          CVSS {f.cvss.toFixed(1)}
                        </span>
                      ) : null}
                      {f.impacto ? (
                        <span className="text-xs text-content-muted">
                          {IMPACTO[f.impacto] || f.impacto}
                        </span>
                      ) : null}
                      {f.prioridad !== null ? (
                        <span className="text-xs text-content-muted">
                          Prioridad {f.prioridad.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="text-xs text-gob-info hover:underline"
                        onClick={() =>
                          openPlan(
                            f.activo,
                            f.version_instalada,
                            f.version_disponible,
                            f.cve
                          )
                        }
                      >
                        Pasos de actualización
                      </button>
                      {f.url ? (
                        <a
                          className="text-xs text-gob-info hover:underline"
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver aviso
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 font-semibold text-content">{f.activo}</p>
                  {f.resumen ? (
                    <p className="text-sm text-content-muted">{f.resumen}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
                    {f.version_instalada ? (
                      <span>
                        Instalada:{" "}
                        <strong className="text-content">{f.version_instalada}</strong>
                      </span>
                    ) : null}
                    {f.version_disponible ? (
                      <span>
                        Actualizar a:{" "}
                        <strong className="text-gob-success">{f.version_disponible}</strong>
                      </span>
                    ) : null}
                    {f.cve ? <span className="font-mono">{f.cve}</span> : null}
                  </div>
                </div>
              ))
            )}
            {filtered.length > 30 ? (
              <p className="text-xs text-content-muted">
                Mostrando 30 de {filtered.length}. Usa los filtros para acotar.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-content">
            Actualizaciones disponibles
          </h3>
          {data.updates.length === 0 ? (
            <p className="text-sm text-content-muted">Sin actualizaciones pendientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-content-muted">
                  <th className="pb-2 pr-4 font-semibold">Software</th>
                  <th className="pb-2 pr-4 font-semibold">Instalada</th>
                  <th className="pb-2 pr-4 font-semibold">Disponible</th>
                  <th className="pb-2 pr-4 font-semibold">Criticidad</th>
                  <th className="pb-2 pr-4 font-semibold">Nota</th>
                  <th className="pb-2 font-semibold">Plan</th>
                </tr>
              </thead>
              <tbody>
                {data.updates.map((u) => (
                  <tr key={u.id} className="border-t border-surface-border">
                    <td className="py-2 pr-4 font-medium text-content">{u.software}</td>
                    <td className="py-2 pr-4 text-content-muted">{u.instalada || "—"}</td>
                    <td className="py-2 pr-4 text-gob-success">{u.disponible || "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={criticidadTone(u.criticidad)}>
                        {u.criticidad ?? "—"}
                      </Badge>
                    </td>
                    <td className="py-2 text-content-muted">{u.nota || u.eol || "—"}</td>
                    <td className="py-2">
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          openPlan(u.software, u.instalada, u.disponible)
                        }
                      >
                        Pasos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-semibold text-content">Fuentes de datos</h3>
          {fuentes.length === 0 ? (
            <p className="text-sm text-content-muted">Sin información de fuentes.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fuentes.map(([name, value]) => (
                <span
                  key={name}
                  className={`pill ${
                    value === "ok"
                      ? "text-gob-success"
                      : value === "error"
                      ? "text-gob-error"
                      : "text-content-muted"
                  }`}
                  title={`${name}: ${value}`}
                >
                  {name}: {value}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-content-muted">
            Centinela cruza inventario, EOL, OSV, CISA KEV, EPSS y avisos RSS.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <p className="mb-3 font-medium text-content">Vigilancia adicional</p>
          {data.watch.length === 0 ? (
            <p className="text-sm text-content-muted">
              Sin productos en vigilancia (solo se revisan los del inventario).
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.watch.map((w, idx) => (
                <span key={`${w}-${idx}`} className="pill">
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <p className="mb-3 font-medium text-content">Cómo decidir</p>
          <ul className="space-y-1.5 text-sm text-content-muted">
            <li>
              <strong className="text-content">Actuar ya / Alta:</strong> actualiza en
              la próxima ventana disponible.
            </li>
            <li>
              <strong className="text-content">KEV:</strong> está siendo explotada;
              priorízala sobre el resto.
            </li>
            <li>
              <strong className="text-content">EOL:</strong> sin soporte del
              proveedor; planifica la migración.
            </li>
            <li>
              <strong className="text-content">Te afecta:</strong> la versión
              instalada está dentro del rango vulnerable.
            </li>
            <li>
              <strong className="text-content">Media / Puede esperar:</strong>{" "}
              programa en el ciclo normal.
            </li>
          </ul>
        </div>
      </section>

      {planService ? (
        <CentinelaPlanModal
          service={planService}
          onClose={() => setPlanService(null)}
        />
      ) : null}
    </div>
  );
}
