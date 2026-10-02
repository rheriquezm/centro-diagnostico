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

function tipoEvento(items: Array<{ nombre: string; total: number }>) {
  const ordenado = [...items].sort((a, b) => b.total - a.total);
  const top = ordenado.slice(0, 5);
  const resto = ordenado.slice(5).reduce((acc, i) => acc + i.total, 0);
  return resto > 0 ? [...top, { nombre: "Otros", total: resto }] : top;
}

type Record = {
  id: number;
  fecha: string | null;
  dispositivo: string | null;
  area: string | null;
  evento: string | null;
  usuario: string;
  pin: string | null;
  tarjeta: string | null;
  modo: string | null;
  lector: string | null;
};

type Grupo = { nombre: string; total: number };

type Resumen = {
  dias: number;
  total: number;
  aperturas: number;
  denegados: number;
  por_evento: Grupo[];
  por_dispositivo: Grupo[];
  por_area: Grupo[];
  por_usuario: Grupo[];
  por_hora: Array<{ hora: number; total: number }>;
};

function esDenegado(evento: string | null): boolean {
  const texto = (evento || "").toLowerCase();
  return ["no registrado", "denegad", "rechaz", "denied", "ilegal", "caduc"].some((t) =>
    texto.includes(t)
  );
}

function esApertura(evento: string | null): boolean {
  return (evento || "").toLowerCase().includes("apertura");
}

export default function AccesosPage() {
  const [dias, setDias] = useState(7);
  const [records, setRecords] = useState<Record[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [dispositivo, setDispositivo] = useState("");
  const [area, setArea] = useState("");
  const [evento, setEvento] = useState("");
  const [usuario, setUsuario] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ dias: String(dias) });
      if (dispositivo) params.set("dispositivo", dispositivo);
      if (area) params.set("area", area);
      if (evento) params.set("evento", evento);
      if (usuario) params.set("usuario", usuario);
      const [rec, res] = await Promise.all([
        api.get<{ items: Record[] }>(`/api/zkbio/records?${params.toString()}`),
        api.get<Resumen>(`/api/zkbio/resumen?dias=${dias}`),
      ]);
      setRecords(rec.items);
      setResumen(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [dias, dispositivo, area, evento, usuario]);

  useEffect(() => {
    load();
  }, [load]);

  async function testConnection() {
    setError(null);
    setMessage(null);
    try {
      const info = await api.get<{ eventos_hoy: number }>("/api/zkbio/test");
      setMessage(`Conexión OK · eventos de hoy: ${info.eventos_hoy}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function sync() {
    setError(null);
    setMessage(null);
    try {
      await api.post(`/api/zkbio/sync?days=${dias}`, {});
      setMessage("Sincronización iniciada; se actualizará en unos segundos.");
      setTimeout(load, 12000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-content">
          Control de Acceso (ZKBio)
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="input max-w-[150px]"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
          >
            <option value={1}>Últimas 24 h</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
          <button className="btn-ghost" onClick={testConnection}>
            Probar conexión
          </button>
          <button className="btn-primary" onClick={sync}>
            Sincronizar
          </button>
        </div>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Eventos" value={resumen?.total ?? "—"} />
        <KpiCard label="Aperturas" value={resumen?.aperturas ?? "—"} />
        <KpiCard label="Intentos denegados" value={resumen?.denegados ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Tipo de evento</p>
          <Donut centerLabel="Eventos" data={tipoEvento(resumen?.por_evento || [])} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Eventos por hora</p>
          <BarChart data={serieHoras(resumen?.por_hora || [])} color="#7c3aed" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Aperturas por usuario</p>
          <BarList colorful items={resumen?.por_usuario || []} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Eventos por dispositivo</p>
          <BarList colorful items={resumen?.por_dispositivo || []} />
        </div>
      </div>

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Dispositivo</label>
          <input
            className="input"
            value={dispositivo}
            onChange={(e) => setDispositivo(e.target.value)}
            placeholder="Piso 8"
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Área</label>
          <input className="input" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Evento</label>
          <input
            className="input"
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            placeholder="Apertura"
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Usuario</label>
          <input className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit">
          Filtrar
        </button>
      </form>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Dispositivo</th>
              <th>Área</th>
              <th>Evento</th>
              <th>Usuario</th>
              <th>Tarjeta</th>
              <th>Modo</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.fecha)}</td>
                <td>{r.dispositivo || "—"}</td>
                <td>{r.area || "—"}</td>
                <td>
                  <Badge
                    tone={
                      esDenegado(r.evento)
                        ? "error"
                        : esApertura(r.evento)
                        ? "success"
                        : "neutral"
                    }
                  >
                    {r.evento || "evento"}
                  </Badge>
                </td>
                <td>{r.usuario}</td>
                <td className="tabular-nums">{r.tarjeta || "—"}</td>
                <td>{r.modo || "—"}</td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-content-muted">
                  Sin registros. Pulsa «Sincronizar».
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
