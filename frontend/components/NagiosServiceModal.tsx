"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

export type ServiceInfo = {
  host: string;
  servicio: string;
  estado: string;
  salida: string;
};

type Analisis = {
  analisis: string;
  recomendacion: string;
  severidad: string;
  provider: string;
};

const TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  OK: "success",
  UP: "success",
  WARNING: "warning",
  PENDING: "warning",
  CRITICAL: "error",
  DOWN: "error",
  UNREACHABLE: "error",
  UNKNOWN: "neutral",
};

const SEV_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  ok: "success",
  bajo: "success",
  medio: "warning",
  alto: "error",
};

export default function NagiosServiceModal({
  service,
  onClose,
}: {
  service: ServiceInfo;
  onClose: () => void;
}) {
  const [data, setData] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    api
      .post<Analisis>("/api/nagios/analizar", {
        host: service.host,
        servicio: service.servicio,
        estado: service.estado,
        salida: service.salida,
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al analizar")
      );
    return () => {
      active = false;
    };
  }, [service]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-surface-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-content">{service.servicio}</h3>
            <p className="text-xs text-content-muted">{service.host}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={TONE[service.estado] || "neutral"}>{service.estado}</Badge>
            <button className="btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
              Salida actual del chequeo
            </p>
            <p className="mt-1 rounded-lg bg-surface-soft p-2 font-mono text-xs text-content">
              {service.salida || "—"}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                Análisis experto (simple)
              </p>
              {data ? (
                <Badge tone={SEV_TONE[data.severidad] || "neutral"}>
                  {data.severidad || "—"}
                </Badge>
              ) : null}
            </div>
            {error ? (
              <p className="text-sm text-gob-error">{error}</p>
            ) : !data ? (
              <p className="text-sm text-content-muted">Analizando…</p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-content">{data.analisis}</p>
                {data.recomendacion ? (
                  <div className="mt-3 rounded-lg bg-surface-soft p-2">
                    <p className="text-xs font-semibold text-content">Recomendación</p>
                    <p className="mt-0.5 text-sm text-content">
                      {data.recomendacion}
                    </p>
                  </div>
                ) : null}
                <p className="mt-2 text-[10px] text-content-muted">
                  Generado por: {data.provider}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
