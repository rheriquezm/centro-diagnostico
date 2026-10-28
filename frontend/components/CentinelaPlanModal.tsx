"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

export type PlanService = {
  host?: string;
  ip?: string;
  os?: string;
  software: string;
  installed?: string;
  available?: string;
  criticality?: number | null;
  eol?: string;
  cve?: string;
};

type Plan = {
  resumen: string;
  pasos: string[];
  verificacion: string[];
  riesgos: string[];
  respaldo: string;
  ventana: string;
  tiempo_estimado: string;
  provider: string;
};

export default function CentinelaPlanModal({
  service,
  onClose,
}: {
  service: PlanService;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPlan(null);
    setError(null);
    setAiError(null);

    api
      .post<Plan>("/api/centinela/plan", service)
      .then((data) => {
        if (active) setPlan(data);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Error al generar el plan"
          );
        }
      });

    return () => {
      active = false;
    };
  }, [service]);

  async function loadAi() {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await api.post<Plan>("/api/centinela/plan-ia", service);
      setPlan(data);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "La IA no respondió"
      );
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 pt-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-surface-border bg-surface p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-content">
              Pasos de actualización · {service.software}
            </h3>
            <p className="text-xs text-content-muted">
              {service.host || "—"}
              {service.ip ? ` · ${service.ip}` : ""}
              {service.os ? ` · ${service.os}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={loadAi} disabled={aiLoading}>
              {aiLoading ? "Generando con IA…" : "Mejorar con IA"}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-content-muted">
            Instalada: <strong className="text-content">{service.installed || "—"}</strong>
          </span>
          <span className="text-content-muted">→</span>
          <span className="text-content-muted">
            Disponible:{" "}
            <strong className="text-gob-success">{service.available || "—"}</strong>
          </span>
          {service.criticality !== null && service.criticality !== undefined ? (
            <Badge tone={service.criticality >= 5 ? "error" : "warning"}>
              Criticidad {service.criticality}
            </Badge>
          ) : null}
          {service.cve ? <Badge tone="neutral">{service.cve}</Badge> : null}
          {service.eol ? <Badge tone="warning">EOL {service.eol}</Badge> : null}
        </div>

        <div className="mt-4 space-y-4">
          {error ? (
            <p className="text-sm text-gob-error">{error}</p>
          ) : !plan ? (
            <p className="text-sm text-content-muted">Generando plan con IA…</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-content">{plan.resumen}</p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Pasos
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-content">
                  {plan.pasos.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Verificación
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-content">
                    {plan.verificacion.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Riesgos
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-content">
                    {plan.riesgos.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-lg bg-surface-soft p-2">
                  <p className="text-[11px] font-semibold uppercase text-content-muted">
                    Respaldo
                  </p>
                  <p className="text-sm text-content">{plan.respaldo}</p>
                </div>
                <div className="rounded-lg bg-surface-soft p-2">
                  <p className="text-[11px] font-semibold uppercase text-content-muted">
                    Ventana
                  </p>
                  <p className="text-sm text-content">{plan.ventana}</p>
                </div>
                <div className="rounded-lg bg-surface-soft p-2">
                  <p className="text-[11px] font-semibold uppercase text-content-muted">
                    Tiempo estimado
                  </p>
                  <p className="text-sm text-content">{plan.tiempo_estimado}</p>
                </div>
              </div>

              {aiError ? (
                <p className="text-xs text-gob-error">{aiError}</p>
              ) : null}
              {aiLoading ? (
                <p className="text-xs text-content-muted">
                  La IA local puede tardar ~30 s; el plan base sigue disponible.
                </p>
              ) : null}
              <p className="text-[10px] text-content-muted">
                Generado por: {plan.provider}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
