"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarChart from "@/components/BarChart";
import BarList from "@/components/BarList";
import ConnectorStatusBar from "@/components/ConnectorStatusBar";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useConnections } from "@/lib/useConnections";

function serieHoras(items: Array<{ hora: number; total: number }>) {
  const map = new Map(items.map((i) => [i.hora, i.total]));
  return Array.from({ length: 24 }, (_, h) => ({ label: h, value: map.get(h) || 0 }));
}

type Record = {
  id: number;
  puerta: string | null;
  categoria: string | null;
  fecha: string | null;
  estado: string | null;
  origen: string | null;
  motivo: string | null;
  usuario: string;
};

type Resumen = {
  dias: number;
  total: number;
  aperturas: number;
  cierres: number;
  por_usuario: Array<{ nombre: string; total: number }>;
  por_puerta: Array<{ nombre: string; total: number }>;
  por_hora: Array<{ hora: number; total: number }>;
};

type YaleDevice = {
  device_id: number;
  description: string;
  category: string | null;
  model: string | null;
  online: boolean;
  low_battery: boolean;
  state: number | null;
  firmware: string | null;
  home: string | null;
};

export default function CerraduraPage() {
  const [dias, setDias] = useState(7);
  const [records, setRecords] = useState<Record[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [devices, setDevices] = useState<YaleDevice[]>([]);
  const [puerta, setPuerta] = useState("");
  const [usuario, setUsuario] = useState("");
  const [estado, setEstado] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const { data: conn, refresh: refreshConn, runSync } = useConnections();

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ dias: String(dias) });
      if (puerta) params.set("puerta", puerta);
      if (usuario) params.set("usuario", usuario);
      if (estado) params.set("estado", estado);
      const [rec, res] = await Promise.all([
        api.get<{ items: Record[] }>(`/api/yale/records?${params.toString()}`),
        api.get<Resumen>(`/api/yale/resumen?dias=${dias}`),
      ]);
      setRecords(rec.items);
      setResumen(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [dias, puerta, usuario, estado]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDevices = useCallback(async () => {
    try {
      const data = await api.get<{ devices: YaleDevice[] }>("/api/yale/devices");
      setDevices(data.devices);
    } catch {
      // informativo; no bloquea la vista
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  async function testConnection() {
    setError(null);
    setMessage(null);
    setTesting(true);
    try {
      const info = await api.get<{ homes: Array<{ description: string }> }>("/api/yale/test");
      setMessage(`Conexión OK · hogares: ${info.homes.map((h) => h.description).join(", ")}`);
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
      const run = await runSync("yale", () => api.post(`/api/yale/sync?days=${dias}`, {}));
      if (run && run.status === "error") {
        setError(run.error || "La sincronización falló.");
        setMessage(null);
      } else if (run) {
        setMessage(`Sincronización completada · ${run.items} registros nuevos.`);
      } else {
        setMessage("Sincronización en curso; el estado se actualizará en breve.");
      }
      await load();
      await loadDevices();
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
        <h2 className="text-2xl font-semibold text-content">Cerradura Yale Connect</h2>
        <div className="flex items-center gap-2">
          <select className="input max-w-[150px]" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Últimas 24 h</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
          </select>
          <button className="btn-ghost" onClick={testConnection} disabled={testing || syncing}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button className="btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      <ConnectorStatusBar
        info={conn?.connectors?.yale}
        scheduler={conn?.scheduler}
        busy={syncing}
      />

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Registros" value={resumen?.total ?? "—"} />
        <KpiCard label="Aperturas" value={resumen?.aperturas ?? "—"} />
        <KpiCard label="Cierres" value={resumen?.cierres ?? "—"} />
      </div>

      {devices.some((d) => d.category === "Lock" && d.low_battery) ? (
        <div className="card text-gob-warning">
          Atención: hay candados con batería baja. Reemplaza las pilas a la brevedad.
        </div>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
          Estado de dispositivos y batería
        </h3>
        <p className="mb-3 text-xs text-content-muted">
          Yale reporta el estado de batería (correcta / baja), no un porcentaje exacto de carga.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <div key={d.device_id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-content" title={d.description}>
                    {d.description}
                  </p>
                  <p className="text-xs text-content-muted">{d.model || d.category}</p>
                </div>
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    d.online ? "bg-gob-success" : "bg-gob-error"
                  }`}
                  title={d.online ? "En línea" : "Sin conexión"}
                />
              </div>
              {d.category === "Lock" ? (
                <div className="flex items-center justify-between text-xs">
                  <Badge tone={d.low_battery ? "error" : "success"}>
                    {d.low_battery ? "Batería baja" : "Batería correcta"}
                  </Badge>
                  <span className={d.online ? "text-gob-success" : "text-gob-error"}>
                    {d.online ? "En línea" : "Sin conexión"}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-content-muted">
                  {d.category} · {d.online ? "en línea" : "sin conexión"}
                </p>
              )}
            </div>
          ))}
          {devices.length === 0 ? (
            <p className="text-sm text-content-muted">
              Sin información de dispositivos. Pulsa «Probar conexión».
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Distribución de eventos</p>
          <Donut
            centerLabel="Registros"
            data={[
              { nombre: "Aperturas", total: resumen?.aperturas ?? 0, color: "#2c8c3a" },
              { nombre: "Cierres", total: resumen?.cierres ?? 0, color: "#003390" },
            ]}
          />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Aperturas por hora</p>
          <BarChart data={serieHoras(resumen?.por_hora || [])} color="#007bff" />
        </div>
      </div>

      <div className="card">
        <p className="mb-4 font-medium text-content">Aperturas por usuario</p>
        <BarList colorful items={resumen?.por_usuario || []} />
      </div>

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Puerta</label>
          <input className="input" value={puerta} onChange={(e) => setPuerta(e.target.value)} placeholder="Oficina TI" />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Usuario</label>
          <input className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-content-muted">Estado</label>
          <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="Desbloqueada">Desbloqueada (apertura)</option>
            <option value="Bloqueada">Bloqueada (cierre)</option>
          </select>
        </div>
        <button className="btn-primary" type="submit">Filtrar</button>
      </form>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th><th>Puerta</th><th>Estado</th><th>Usuario</th>
              <th>Origen</th><th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.fecha)}</td>
                <td>{r.puerta}</td>
                <td>
                  <Badge tone={r.estado === "Desbloqueada" ? "success" : "neutral"}>
                    {r.estado || "evento"}
                  </Badge>
                </td>
                <td>{r.usuario}</td>
                <td>{r.origen}</td>
                <td>{r.motivo || "—"}</td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr><td colSpan={6} className="text-content-muted">Sin registros. Pulsa “Sincronizar”.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
