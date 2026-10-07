"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarList from "@/components/BarList";
import ConnectorStatusBar from "@/components/ConnectorStatusBar";
import DiagnosisModal from "@/components/DiagnosisModal";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
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
