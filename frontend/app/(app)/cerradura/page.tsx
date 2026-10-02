"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarChart from "@/components/BarChart";
import BarList from "@/components/BarList";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

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

export default function CerraduraPage() {
  const [dias, setDias] = useState(7);
  const [records, setRecords] = useState<Record[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [puerta, setPuerta] = useState("");
  const [usuario, setUsuario] = useState("");
  const [estado, setEstado] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function testConnection() {
    setError(null);
    try {
      const info = await api.get<{ homes: Array<{ description: string }> }>("/api/yale/test");
      setMessage(`Conexión OK · hogares: ${info.homes.map((h) => h.description).join(", ")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function sync() {
    setError(null);
    try {
      await api.post(`/api/yale/sync?days=${dias}`, {});
      setMessage("Sincronización iniciada; se actualizará en breve.");
      setTimeout(load, 12000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
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
          <button className="btn-ghost" onClick={testConnection}>Probar conexión</button>
          <button className="btn-primary" onClick={sync}>Sincronizar</button>
        </div>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Registros" value={resumen?.total ?? "—"} />
        <KpiCard label="Aperturas" value={resumen?.aperturas ?? "—"} />
        <KpiCard label="Cierres" value={resumen?.cierres ?? "—"} />
      </div>

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
