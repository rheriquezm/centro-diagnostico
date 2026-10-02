"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarList from "@/components/BarList";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Ticket = {
  id: number;
  redmine_id: number;
  project_name: string | null;
  tracker: string | null;
  status: string | null;
  closed: boolean;
  priority: string | null;
  assigned_to: string | null;
  subject: string;
  updated_on: string | null;
};

type Grupo = { nombre: string; total: number };

type Resumen = {
  total: number;
  abiertos: number;
  cerrados: number;
  por_estado: Grupo[];
  por_prioridad: Grupo[];
  por_proyecto: Grupo[];
  por_tracker: Grupo[];
  por_asignado: Grupo[];
};

export default function RedminePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("q", q);
      if (openOnly) params.set("open_only", "true");
      const [data, res] = await Promise.all([
        api.get<{ total: number; items: Ticket[] }>(
          `/api/redmine/tickets?${params.toString()}`
        ),
        api.get<Resumen>("/api/redmine/resumen"),
      ]);
      setTickets(data.items);
      setTotal(data.total);
      setResumen(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [q, openOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function testConnection() {
    setError(null);
    try {
      const info = await api.get<{ login: string }>("/api/redmine/test");
      setMessage(`Conexión OK · usuario ${info.login}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function sync() {
    setError(null);
    try {
      const r = await api.post<{ status: string }>("/api/redmine/sync?max_issues=500", {});
      setMessage(`Sincronización ${r.status}. Se actualizará la lista al finalizar.`);
      setTimeout(load, 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-content">Redmine</h2>
          <p className="text-sm text-content-muted">Tickets de incidencias y requerimientos.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={testConnection}>Probar conexión</button>
          <button className="btn-primary" onClick={sync}>Sincronizar</button>
        </div>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Tickets" value={resumen?.total ?? "—"} />
        <KpiCard label="Abiertos" value={resumen?.abiertos ?? "—"} />
        <KpiCard label="Cerrados" value={resumen?.cerrados ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Distribución por estado</p>
          <Donut centerLabel="Tickets" data={resumen?.por_estado || []} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Por prioridad</p>
          <BarList colorful items={resumen?.por_prioridad || []} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Por proyecto</p>
          <BarList colorful items={resumen?.por_proyecto || []} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Carga por responsable (abiertos)</p>
          <BarList colorful items={resumen?.por_asignado || []} />
        </div>
      </div>

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Buscar</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Solo abiertos
        </label>
        <button className="btn-primary" type="submit">Filtrar</button>
      </form>

      <p className="text-sm text-content-muted">{total} tickets sincronizados</p>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Proyecto</th><th>Asunto</th><th>Estado</th>
              <th>Prioridad</th><th>Asignado</th><th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>{t.redmine_id}</td>
                <td>{t.project_name}</td>
                <td className="max-w-[360px]">{t.subject}</td>
                <td>
                  <Badge tone={t.closed ? "neutral" : "success"}>{t.status}</Badge>
                </td>
                <td>{t.priority}</td>
                <td>{t.assigned_to || "—"}</td>
                <td>{formatDateTime(t.updated_on)}</td>
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr><td colSpan={7} className="text-content-muted">Sin tickets. Pulsa “Sincronizar”.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
