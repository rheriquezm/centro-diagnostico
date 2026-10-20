"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Timeline = {
  fecha: string | null;
  tipo: string;
  autor?: string | null;
  detalle?: string | null;
};
type Journal = { fecha: string | null; autor?: string | null; notas?: string | null };

type Detalle = {
  redmine_id: number;
  subject: string;
  priority: string | null;
  status: string | null;
  url: string;
  creado: string | null;
  primera_respuesta: string | null;
  cerrado: string | null;
  tiempo_respuesta_h: number | null;
  tiempo_resolucion_h: number | null;
  sla_criticidad: string | null;
  sla_respuesta_h: number | null;
  sla_resolucion_h: number | null;
  estado_respuesta: string;
  estado_resolucion: string;
  estado: string;
  motivo: string;
  contrato_clausula?: string | null;
  timeline: Timeline[];
  journals: Journal[];
};

function fmt(h: number | null): string {
  if (h === null || h === undefined) return "—";
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h} h`;
}
function tono(e: string): string {
  return e === "cumple" ? "success" : e === "excede" ? "error" : "neutral";
}

export default function SlaDetailModal({
  ticketId,
  onClose,
}: {
  ticketId: number;
  onClose: () => void;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    api
      .get<Detalle>(`/api/contracts/sla-detalle/${ticketId}`)
      .then((r) => {
        if (active) setD(r);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Error");
      });
    return () => {
      active = false;
    };
  }, [ticketId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-content">
              ¿Por qué excede el SLA?
            </h3>
            <p className="text-xs text-content-muted">
              Caso #{d?.redmine_id ?? ticketId}
              {d?.url ? (
                <>
                  {" · "}
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gob-info hover:underline"
                  >
                    abrir en Redmine
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error ? (
          <div className="card text-gob-error">{error}</div>
        ) : !d ? (
          <p className="text-content-muted">Cargando detalle…</p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-medium text-content">{d.subject}</p>

            <div className="rounded-lg border border-surface-border bg-surface-soft p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                Motivo del exceso
              </p>
              <p className="text-sm text-content">{d.motivo}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-surface-border p-3">
                <p className="mb-1 text-xs font-semibold text-content">
                  Tiempo de respuesta
                </p>
                <p className="text-sm text-content-muted">
                  Proveedor: <span className="text-content">{fmt(d.tiempo_respuesta_h)}</span>{" "}
                  · Contrato (SLA {d.sla_criticidad || "—"}):{" "}
                  <span className="text-content">{fmt(d.sla_respuesta_h)}</span>
                </p>
                <Badge tone={tono(d.estado_respuesta)}>{d.estado_respuesta}</Badge>
              </div>
              <div className="rounded-lg border border-surface-border p-3">
                <p className="mb-1 text-xs font-semibold text-content">
                  Tiempo de resolución
                </p>
                <p className="text-sm text-content-muted">
                  Proveedor: <span className="text-content">{fmt(d.tiempo_resolucion_h)}</span>{" "}
                  · Contrato:{" "}
                  <span className="text-content">{fmt(d.sla_resolucion_h)}</span>
                </p>
                <Badge tone={tono(d.estado_resolucion)}>{d.estado_resolucion}</Badge>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-content">
                Línea de tiempo
              </p>
              <ol className="space-y-2 text-sm">
                {d.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gob-blue" />
                    <span>
                      <span className="font-medium">{t.tipo}</span>{" "}
                      <span className="text-content-muted">
                        · {formatDateTime(t.fecha)}
                        {t.autor ? ` · ${t.autor}` : ""}
                      </span>
                      {t.detalle ? (
                        <span className="block text-xs text-content-muted">
                          {t.detalle}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {d.journals.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-content">
                  Historial del caso
                </p>
                <div className="max-h-56 space-y-2 overflow-auto">
                  {d.journals.map((j, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-surface-border bg-surface-soft p-2 text-xs"
                    >
                      <p className="text-content-muted">
                        {formatDateTime(j.fecha)}
                        {j.autor ? ` · ${j.autor}` : ""}
                      </p>
                      {j.notas ? <p className="text-content">{j.notas}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
