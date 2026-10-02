"use client";

import { useEffect, useState } from "react";

import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";

type Indicators = {
  ventana_horas: number;
  errores_actual: number;
  errores_anterior: number;
  variacion_pct: number | null;
  nuevos: number;
  sin_ticket: number;
  reincidencias: number;
  recurrentes: number;
  fingerprints_total: number;
  tickets_abiertos: number;
  tickets_cerrados: number;
};

export default function MejoraContinuaPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Indicators | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Indicators>(`/api/continuous/indicators?hours=${hours}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Error"));
  }, [hours]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-content">Mejora Continua</h2>
        <select className="input max-w-[160px]" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={24}>Últimas 24 h</option>
          <option value={168}>7 días</option>
          <option value={720}>30 días</option>
        </select>
      </div>

      {error ? <div className="card text-gob-error">{error}</div> : null}
      {!data ? (
        <p className="text-content-muted">Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label={`Errores (${hours} h)`} value={data.errores_actual} hint={`Periodo anterior: ${data.errores_anterior}`} />
          <KpiCard label="Variación" value={data.variacion_pct === null ? "—" : `${data.variacion_pct}%`} />
          <KpiCard label="Nuevos" value={data.nuevos} />
          <KpiCard label="Sin ticket" value={data.sin_ticket} />
          <KpiCard label="Reincidencias" value={data.reincidencias} />
          <KpiCard label="Recurrentes" value={data.recurrentes} />
          <KpiCard label="Problemas (fingerprints)" value={data.fingerprints_total} />
          <KpiCard label="Tickets abiertos" value={data.tickets_abiertos} hint={`Cerrados: ${data.tickets_cerrados}`} />
        </div>
      )}
    </div>
  );
}
