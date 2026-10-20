"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarList from "@/components/BarList";
import ConnectorStatusBar from "@/components/ConnectorStatusBar";
import DiagnosisModal from "@/components/DiagnosisModal";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import SimpleMarkdown from "@/components/SimpleMarkdown";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { exportarInforme, mdToHtml } from "@/lib/report";
import { useConnections } from "@/lib/useConnections";

type Host = { host: string; total: number };

type Fingerprint = {
  id: number;
  fingerprint: string;
  severidad: string;
  exception_type: string | null;
  aplicacion: string | null;
  servicio: string | null;
  ocurrencias: number;
  primera: string | null;
  ultima: string | null;
  template: string | null;
  hosts: Host[];
};

type Grupo = { nombre: string; total: number; ocurrencias?: number };

type Resumen = {
  total: number;
  ocurrencias: number;
  criticos: number;
  aplicaciones: number;
  por_severidad: Grupo[];
  por_aplicacion: Grupo[];
  por_servicio: Grupo[];
  top: Array<{
    id: number;
    problema: string;
    aplicacion: string | null;
    servicio: string | null;
    severidad: string;
    ocurrencias: number;
    hosts: Host[];
  }>;
};

type RangoItem = {
  id: number;
  problema: string;
  severidad: string;
  aplicacion: string | null;
  servicio: string | null;
  ocurrencias: number;
  primera: string | null;
  ultima: string | null;
  hosts: Host[];
};
type RangoData = {
  desde: string | null;
  hasta: string | null;
  total_fingerprints: number;
  ocurrencias: number;
  items: RangoItem[];
  por_severidad: Grupo[];
  por_host: Grupo[];
};
type Vuln = {
  titulo: string;
  riesgo?: string;
  evidencia?: string;
  recomendacion?: string;
};
type Consulta = {
  respuesta: string;
  vulnerabilidades: Vuln[];
  recomendaciones: string[];
  provider: string;
  confianza?: number | null;
};

function localInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(
    date.getDate()
  )}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function HostCell({ hosts }: { hosts?: Host[] }) {
  if (!hosts || hosts.length === 0) return <span className="text-content-muted">—</span>;
  const [first, ...rest] = hosts;
  return (
    <span
      className="font-mono text-xs"
      title={hosts.map((h) => `${h.host} (${h.total})`).join(", ")}
    >
      {first.host}
      {rest.length ? <span className="text-content-muted"> +{rest.length}</span> : null}
    </span>
  );
}

export default function GraylogPage() {
  const [items, setItems] = useState<Fingerprint[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeSeconds, setRangeSeconds] = useState(86400);
  const [maxMessages, setMaxMessages] = useState(2000);
  const [selected, setSelected] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [desde, setDesde] = useState(() =>
    localInput(new Date(Date.now() - 7 * 86400000))
  );
  const [hasta, setHasta] = useState(() => localInput(new Date()));
  const [rangoData, setRangoData] = useState<RangoData | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [pregunta, setPregunta] = useState("");
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [consultando, setConsultando] = useState(false);
  const { data: conn, refresh: refreshConn, runSync } = useConnections();

  const load = useCallback(async () => {
    try {
      const [fps, res] = await Promise.all([
        api.get<{ items: Fingerprint[] }>("/api/graylog/fingerprints"),
        api.get<Resumen>("/api/graylog/resumen"),
      ]);
      setItems(fps.items);
      setResumen(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function testConnection() {
    setError(null);
    setMessage(null);
    setTesting(true);
    try {
      const info = await api.get<{ version: string }>("/api/graylog/test");
      setMessage(`Graylog ${info.version} conectado.`);
      await refreshConn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setError(null);
    setMessage("Sincronización iniciada; procesando…");
    setSyncing(true);
    try {
      const run = await runSync("graylog", () =>
        api.post(
          `/api/graylog/sync?query=*&range_seconds=${rangeSeconds}&max_messages=${maxMessages}`,
          {}
        )
      );
      if (run && run.status === "error") {
        setError(run.error || "La sincronización falló.");
        setMessage(null);
      } else if (run) {
        setMessage(`Sincronización completada · ${run.items} registros considerados.`);
      } else {
        setMessage("Sincronización en curso; el estado se actualizará en breve.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setMessage(null);
    } finally {
      setSyncing(false);
    }
  }

  async function analizarRango() {
    setAnalizando(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (desde) q.set("desde", new Date(desde).toISOString());
      if (hasta) q.set("hasta", new Date(hasta).toISOString());
      const data = await api.get<RangoData>(`/api/graylog/rango?${q.toString()}`);
      setRangoData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setAnalizando(false);
    }
  }

  async function consultar() {
    const q = pregunta.trim();
    if (!q) return;
    setConsultando(true);
    setError(null);
    setConsulta(null);
    try {
      const body: Record<string, unknown> = { pregunta: q };
      if (desde) body.desde = new Date(desde).toISOString();
      if (hasta) body.hasta = new Date(hasta).toISOString();
      const res = await api.post<Consulta>("/api/graylog/consultar", body);
      setConsulta(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setConsultando(false);
    }
  }

  function exportarSeguridad() {
    const secs: Array<{ titulo?: string; html: string }> = [];
    if (rangoData) {
      secs.push({
        titulo: "Rango analizado",
        html: mdToHtml(
          `Desde: ${desde}\nHasta: ${hasta}\n\nEventos: ${rangoData.ocurrencias} en ${rangoData.total_fingerprints} tipos\n\n` +
            rangoData.por_host.map((h) => `- ${h.nombre}: ${h.total}`).join("\n")
        ),
      });
    }
    if (consulta) {
      secs.push({ titulo: "Análisis", html: mdToHtml(consulta.respuesta) });
      if (consulta.vulnerabilidades.length > 0) {
        secs.push({
          titulo: "Vulnerabilidades / riesgos",
          html: consulta.vulnerabilidades
            .map((v) =>
              mdToHtml(
                `**${v.titulo}**${v.riesgo ? ` (riesgo: ${v.riesgo})` : ""}\n` +
                  (v.evidencia ? `Evidencia: ${v.evidencia}\n` : "") +
                  (v.recomendacion ? `Recomendación: ${v.recomendacion}` : "")
              )
            )
            .join(""),
        });
      }
      if (consulta.recomendaciones.length > 0) {
        secs.push({
          titulo: "Recomendaciones",
          html: mdToHtml(
            consulta.recomendaciones.map((r) => `- ${r}`).join("\n")
          ),
        });
      }
    }
    exportarInforme("Informe de seguridad — Graylog", secs);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-content">Graylog</h2>
          <p className="text-sm text-content-muted">
            Errores de aplicación agrupados por huella (fingerprint).
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={testConnection} disabled={testing || syncing}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button className="btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? "Sincronizando…" : "Sincronizar y agrupar"}
          </button>
        </div>
      </div>

      <ConnectorStatusBar
        info={conn?.connectors?.graylog}
        scheduler={conn?.scheduler}
        busy={syncing}
      />

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-content">
              Análisis por rango y vulnerabilidades
            </p>
            <p className="text-xs text-content-muted">
              Elige fecha/hora, analiza el rango y consulta a la IA sobre riesgos.
            </p>
          </div>
          <button
            className="btn-ghost"
            onClick={exportarSeguridad}
            disabled={!rangoData && !consulta}
          >
            Exportar informe
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm text-content-muted">Desde</label>
            <input
              type="datetime-local"
              className="input"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-content-muted">Hasta</label>
            <input
              type="datetime-local"
              className="input"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <button
            className="btn-ghost"
            onClick={analizarRango}
            disabled={analizando}
          >
            {analizando ? "Analizando…" : "Analizar rango"}
          </button>
        </div>

        {rangoData ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="Problemas" value={rangoData.total_fingerprints} />
              <KpiCard label="Ocurrencias" value={rangoData.ocurrencias} />
              <KpiCard label="Hosts" value={rangoData.por_host.length} />
              <KpiCard label="Severidades" value={rangoData.por_severidad.length} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-content">
                  Por severidad
                </p>
                <BarList colorful items={rangoData.por_severidad} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-content">Por host</p>
                <BarList colorful items={rangoData.por_host} />
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                consultar();
              }
            }}
            placeholder="Pregunta (p. ej. ¿qué vulnerabilidades hay y cómo mitigarlas?)"
          />
          <button
            className="btn-primary"
            onClick={consultar}
            disabled={consultando || !pregunta.trim()}
          >
            {consultando ? "Consultando…" : "Consultar"}
          </button>
        </div>

        {consulta ? (
          <div className="space-y-3 rounded-xl border border-surface-border bg-surface-soft/40 p-4">
            <div className="text-sm text-content">
              <SimpleMarkdown text={consulta.respuesta} />
            </div>
            {consulta.vulnerabilidades.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-content">
                  Vulnerabilidades / riesgos
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {consulta.vulnerabilidades.map((v, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-surface-border bg-surface-card p-3 text-xs"
                    >
                      <p className="font-semibold text-content">{v.titulo}</p>
                      {v.riesgo ? (
                        <Badge
                          tone={
                            v.riesgo.toLowerCase().includes("alto")
                              ? "error"
                              : v.riesgo.toLowerCase().includes("bajo")
                              ? "info"
                              : "warning"
                          }
                        >
                          {v.riesgo}
                        </Badge>
                      ) : null}
                      {v.evidencia ? (
                        <p className="mt-1 text-content-muted">{v.evidencia}</p>
                      ) : null}
                      {v.recomendacion ? (
                        <p className="mt-1 text-content">
                          Recomendación: {v.recomendacion}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {consulta.recomendaciones.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-semibold text-content">
                  Recomendaciones
                </p>
                <ul className="ml-4 list-disc space-y-1 text-sm text-content">
                  {consulta.recomendaciones.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[11px] text-content-muted">
              Motor: {consulta.provider}
              {typeof consulta.confianza === "number"
                ? ` · ${Math.round(consulta.confianza * 100)}%`
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Problemas" value={resumen?.total ?? "—"} />
        <KpiCard label="Ocurrencias" value={resumen?.ocurrencias ?? "—"} />
        <KpiCard label="Críticos" value={resumen?.criticos ?? "—"} />
        <KpiCard label="Aplicaciones" value={resumen?.aplicaciones ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Distribución por severidad</p>
          <Donut
            centerLabel="Problemas"
            data={(resumen?.por_severidad || []).map((s) => ({
              nombre: s.nombre,
              total: s.total,
            }))}
          />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Top aplicaciones (ocurrencias)</p>
          <BarList
            colorful
            items={(resumen?.por_aplicacion || []).map((a) => ({
              nombre: a.nombre,
              total: a.ocurrencias ?? a.total,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Top servicios (ocurrencias)</p>
          <BarList
            colorful
            items={(resumen?.por_servicio || []).map((a) => ({
              nombre: a.nombre,
              total: a.ocurrencias ?? a.total,
            }))}
          />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Problemas con más ocurrencias</p>
          <ul className="space-y-2.5 text-sm">
            {(resumen?.top || []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Badge tone={t.severidad}>{t.severidad}</Badge>
                  <span className="truncate" title={t.problema}>{t.problema}</span>
                  <span
                    className="hidden shrink-0 rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[10px] text-content-muted md:inline"
                    title={t.hosts.map((h) => `${h.host} (${h.total})`).join(", ")}
                  >
                    {t.hosts[0]?.host || "sin máquina"}
                    {t.hosts.length > 1 ? ` +${t.hosts.length - 1}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-content-muted">{t.ocurrencias}</span>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setSelected(t.id)}
                  >
                    Soluciones IA
                  </button>
                </span>
              </li>
            ))}
            {(resumen?.top || []).length === 0 ? (
              <li className="text-content-muted">Sin datos.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm text-content-muted">Rango (segundos)</label>
          <input
            type="number"
            className="input"
            value={rangeSeconds}
            onChange={(e) => setRangeSeconds(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-content-muted">Máx. mensajes</label>
          <input
            type="number"
            className="input"
            value={maxMessages}
            onChange={(e) => setMaxMessages(Number(e.target.value))}
          />
        </div>
      </div>

      <p className="text-sm text-content-muted">{items.length} problemas (fingerprints) detectados</p>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Severidad</th><th>Problema</th><th>Aplicación</th>
              <th>Servicio</th><th>Máquina</th><th>Ocurrencias</th><th>Primera</th><th>Última</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((fp) => (
              <tr key={fp.id}>
                <td><Badge tone={fp.severidad}>{fp.severidad}</Badge></td>
                <td className="max-w-[420px]">{fp.template || fp.exception_type}</td>
                <td>{fp.aplicacion}</td>
                <td>{fp.servicio || "—"}</td>
                <td><HostCell hosts={fp.hosts} /></td>
                <td>{fp.ocurrencias}</td>
                <td>{formatDateTime(fp.primera)}</td>
                <td>{formatDateTime(fp.ultima)}</td>
                <td>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setSelected(fp.id)}
                  >
                    Soluciones IA
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={9} className="text-content-muted">Sin fingerprints. Pulsa “Sincronizar y agrupar”.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected !== null ? (
        <DiagnosisModal fingerprintId={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
