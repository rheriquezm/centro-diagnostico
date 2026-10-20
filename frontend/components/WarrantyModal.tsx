"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";
import { exportarInforme, mdToHtml } from "@/lib/report";

type Warranty = {
  redmine_id: number;
  subject: string;
  provider: string;
  contrato: string;
  veredicto: string;
  confianza?: number | null;
  justificacion?: string;
  clausulas?: string[];
  extractos?: { documento: string; fragmento: string }[];
  acciones?: string[];
  aviso: string;
};

function tono(v: string): string {
  if (v === "garantia") return "success";
  if (v === "nuevo_desarrollo") return "error";
  return "warning";
}

function etiqueta(v: string): string {
  if (v === "garantia") return "Cubierto por garantía";
  if (v === "nuevo_desarrollo") return "Nuevo desarrollo (fuera de garantía)";
  return "Indeterminado";
}

export default function WarrantyModal({
  ticketId,
  onClose,
}: {
  ticketId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<Warranty | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setData(null);
    api
      .post<Warranty>(`/api/contracts/analyze-ticket/${ticketId}`, {})
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Error");
      });
    return () => {
      active = false;
    };
  }, [ticketId]);

  function exportar() {
    if (!data) return;
    const secs: Array<{ titulo?: string; html: string }> = [
      {
        titulo: "Caso",
        html: mdToHtml(
          `${data.subject || ""}${
            data.contrato ? `\n\nContrato(s): ${data.contrato}` : ""
          }`
        ),
      },
      {
        titulo: `Veredicto: ${etiqueta(data.veredicto)}`,
        html: mdToHtml(
          `Confianza: ${
            typeof data.confianza === "number"
              ? `${Math.round(data.confianza * 100)}%`
              : "n/d"
          }\n\n${data.justificacion || ""}`
        ),
      },
    ];
    if ((data.extractos || []).length > 0) {
      secs.push({
        titulo: "Fundamento en el contrato",
        html: mdToHtml(
          (data.extractos || [])
            .map((e) => `- ${e.documento}: "${e.fragmento}"`)
            .join("\n")
        ),
      });
    }
    if ((data.clausulas || []).length > 0) {
      secs.push({
        titulo: "Cláusulas (IA)",
        html: mdToHtml((data.clausulas || []).map((c) => `- ${c}`).join("\n")),
      });
    }
    if ((data.acciones || []).length > 0) {
      secs.push({
        titulo: "Acciones sugeridas",
        html: mdToHtml((data.acciones || []).map((a) => `- ${a}`).join("\n")),
      });
    }
    exportarInforme(`Informe de garantía — Caso #${data.redmine_id}`, secs);
  }

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
              Análisis de garantía
            </h3>
            <p className="text-xs text-content-muted">
              Caso #{data?.redmine_id ?? ticketId}
              {data?.contrato ? ` · contrato: ${data.contrato}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data ? (
              <button className="btn-ghost" onClick={exportar}>
                Exportar informe
              </button>
            ) : null}
            <button className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        {error ? (
          <div className="card text-gob-error">{error}</div>
        ) : !data ? (
          <p className="text-content-muted">Analizando el caso contra el contrato…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tono(data.veredicto)}>{etiqueta(data.veredicto)}</Badge>
              {typeof data.confianza === "number" ? (
                <Badge tone={data.confianza >= 0.6 ? "success" : "warning"}>
                  Confianza {Math.round(data.confianza * 100)}%
                </Badge>
              ) : null}
              <span className="text-xs text-content-muted">IA: {data.provider}</span>
            </div>

            {data.subject ? (
              <p className="text-sm font-medium text-content">{data.subject}</p>
            ) : null}

            {data.justificacion ? (
              <p className="text-sm text-content-muted">{data.justificacion}</p>
            ) : null}

            {(data.extractos || []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-content">
                  Fundamento en el contrato
                </p>
                <ul className="space-y-1.5">
                  {(data.extractos || []).map((e, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-surface-border bg-surface-soft p-2 text-xs text-content"
                    >
                      <span className="font-semibold">{e.documento}</span>:{" "}
                      <span className="italic">“{e.fragmento}”</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(data.clausulas || []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-content">
                  Cláusulas relevantes del contrato
                </p>
                <ul className="space-y-1.5 text-sm">
                  {(data.clausulas || []).map((c, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-surface-border bg-surface-soft p-2 text-xs text-content"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(data.acciones || []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-content">
                  Acciones sugeridas
                </p>
                <ul className="space-y-1 text-sm">
                  {(data.acciones || []).map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gob-info" />
                      <span className="text-content">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-content-muted">{data.aviso}</p>
          </div>
        )}
      </div>
    </div>
  );
}
