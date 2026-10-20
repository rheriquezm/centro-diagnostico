"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import KpiCard from "@/components/KpiCard";
import SlaDetailModal from "@/components/SlaDetailModal";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { exportarInforme, mdToHtml } from "@/lib/report";

type Item = {
  id: number;
  redmine_id: number;
  subject: string;
  url: string;
  priority: string | null;
  status: string | null;
  creado: string | null;
  primera_respuesta: string | null;
  tiempo_respuesta_h: number | null;
  tiempo_resolucion_h: number | null;
  sla_criticidad: string | null;
  sla_respuesta_h: number | null;
  sla_resolucion_h: number | null;
  estado_respuesta: string;
  estado_resolucion: string;
  estado: string;
};

type Data = {
  total: number;
  exceden: number;
  cumplen: number;
  sin_sla: number;
  items: Item[];
};

function fmtHoras(h: number | null): string {
  if (h === null || h === undefined) return "—";
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h} h`;
}

function exceso(t: number | null, sla: number | null): { texto: string; positivo: boolean } {
  if (t === null || sla === null) return { texto: "—", positivo: false };
  const d = t - sla;
  if (d <= 0) return { texto: "en tiempo", positivo: false };
  const txt = d >= 48 ? `${(d / 24).toFixed(1)} d` : `${d % 1 === 0 ? d : d.toFixed(1)} h`;
  return { texto: `+${txt}`, positivo: true };
}

function tono(estado: string): string {
  if (estado === "cumple") return "success";
  if (estado === "excede") return "error";
  return "neutral";
}

export default function SlaCompliance() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("excede");
  const [detalleId, setDetalleId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Data>("/api/contracts/sla-cumplimiento");
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = (data?.items || []).filter((i) =>
    filtro ? i.estado === filtro : true
  );

  function exportar() {
    if (!data) return;
    const filas = (data.items || []).filter((i) => i.estado !== "cumple");
    exportarInforme("Informe de cumplimiento de SLA", [
      {
        titulo: "Resumen",
        html: mdToHtml(
          `Abiertos: ${data.total}\nCumplen: ${data.cumplen}\nExceden: ${data.exceden}\nSin SLA: ${data.sin_sla}`
        ),
      },
      {
        titulo: "Tickets que exceden SLA",
        html:
          filas
            .map((i) =>
              mdToHtml(
                `**#${i.redmine_id}** [${i.priority}] ${i.subject}\n` +
                  `Respuesta: ${fmtHoras(i.tiempo_respuesta_h)} vs SLA ${fmtHoras(
                    i.sla_respuesta_h
                  )} → ${i.estado_respuesta}\n` +
                  `Resolución: ${fmtHoras(i.tiempo_resolucion_h)} vs SLA ${fmtHoras(
                    i.sla_resolucion_h
                  )} → ${i.estado_resolucion}`
              )
            )
            .join("") || mdToHtml("Sin incumplimientos."),
      },
    ]);
  }

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-content">
            Cumplimiento de SLA (tickets abiertos)
          </p>
          <p className="text-xs text-content-muted">
            Tiempos de respuesta/resolución vs. los SLA del contrato.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input max-w-[170px]"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          >
            <option value="excede">Solo incumplen</option>
            <option value="cumple">Solo cumplen</option>
            <option value="">Todos</option>
          </select>
          <button className="btn-ghost" onClick={load}>
            Actualizar
          </button>
          <button
            className="btn-ghost"
            onClick={exportar}
            disabled={!data}
          >
            Exportar informe
          </button>
        </div>
      </div>

      {error ? <p className="mb-2 text-xs text-gob-error">{error}</p> : null}

      <div className="mb-3 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Abiertos" value={data?.total ?? "—"} />
        <KpiCard
          label="Cumplen SLA"
          value={data?.cumplen ?? "—"}
          accent="#2c8c3a"
        />
        <KpiCard
          label="Exceden SLA"
          value={data?.exceden ?? "—"}
          accent="#d93025"
        />
        <KpiCard label="Sin SLA" value={data?.sin_sla ?? "—"} accent="#64748b" />
      </div>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Prioridad</th>
              <th>Criticidad</th>
              <th>Asunto</th>
              <th className="text-right">Resp.</th>
              <th className="text-right">SLA resp.</th>
              <th className="text-right">Exceso</th>
              <th>Estado resp.</th>
              <th className="text-right">Resol.</th>
              <th className="text-right">SLA resol.</th>
              <th className="text-right">Exceso</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.redmine_id}>
                <td>
                  {i.url ? (
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gob-info hover:underline"
                      title="Abrir el caso en Redmine"
                    >
                      {i.redmine_id}
                    </a>
                  ) : (
                    i.redmine_id
                  )}
                </td>
                <td>{i.priority || "—"}</td>
                <td className="text-content-muted">{i.sla_criticidad || "—"}</td>
                <td className="max-w-[280px] truncate">{i.subject}</td>
                <td className="text-right tabular-nums">
                  {fmtHoras(i.tiempo_respuesta_h)}
                </td>
                <td className="text-right tabular-nums text-content-muted">
                  {fmtHoras(i.sla_respuesta_h)}
                </td>
                <td
                  className={`text-right tabular-nums ${
                    exceso(i.tiempo_respuesta_h, i.sla_respuesta_h).positivo
                      ? "font-medium text-gob-error"
                      : "text-content-muted"
                  }`}
                >
                  {exceso(i.tiempo_respuesta_h, i.sla_respuesta_h).texto}
                </td>
                <td>
                  <Badge tone={tono(i.estado_respuesta)}>
                    {i.estado_respuesta}
                  </Badge>
                </td>
                <td className="text-right tabular-nums">
                  {fmtHoras(i.tiempo_resolucion_h)}
                </td>
                <td className="text-right tabular-nums text-content-muted">
                  {fmtHoras(i.sla_resolucion_h)}
                </td>
                <td
                  className={`text-right tabular-nums ${
                    exceso(i.tiempo_resolucion_h, i.sla_resolucion_h).positivo
                      ? "font-medium text-gob-error"
                      : "text-content-muted"
                  }`}
                >
                  {exceso(i.tiempo_resolucion_h, i.sla_resolucion_h).texto}
                </td>
                <td>
                  <Badge tone={tono(i.estado)}>{i.estado}</Badge>
                </td>
                <td>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => setDetalleId(i.id)}
                    title="Ver por qué excede el SLA"
                  >
                    ¿Por qué?
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-content-muted">
                  {data && data.total === 0
                    ? "Sin tickets abiertos."
                    : "Sin resultados para el filtro."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detalleId !== null ? (
        <SlaDetailModal ticketId={detalleId} onClose={() => setDetalleId(null)} />
      ) : null}
    </section>
  );
}
