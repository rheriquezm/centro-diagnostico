"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

type Provider = { id: string; label: string; model: string; available: boolean };

type TicketRel = {
  redmine_id: number;
  subject: string;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  similitud: number;
  sugerido: boolean;
  url: string;
};

type FpRel = {
  fingerprint_id: number;
  problema: string;
  severidad: string | null;
  similitud: number;
};

type Analysis = {
  summary?: string;
  technical_explanation?: string;
  probable_causes?: string[];
  recommended_checks?: string[];
  recommended_actions?: string[];
  provider_request?: string;
  severity_reasoning?: string;
  code_snippet?: string | null;
  advertencia?: string;
  confidence?: number | null;
};

type NagiosCtx = {
  hosts: { host: string; estado: string }[];
  servicios_con_problema: { host: string; servicio: string; estado: string }[];
  conteo: { hosts: number; servicios: number; problemas: number };
};

type FingerprintResult = {
  fingerprint_id: number;
  provider: string;
  model?: string | null;
  confidence?: number | null;
  analysis: Analysis;
  tickets: TicketRel[];
  context?: { machines?: string[]; nagios?: NagiosCtx | null };
  aviso: string;
};

type TicketResult = {
  ticket_id: number;
  redmine_id: number;
  subject: string;
  provider: string;
  model?: string | null;
  confidence?: number | null;
  analysis: Analysis;
  related_fingerprints: FpRel[];
  aviso: string;
};

type Result = FingerprintResult | TicketResult;

function isTicket(r: Result): r is TicketResult {
  return "related_fingerprints" in r;
}

function List({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  const lista = items || [];
  if (lista.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-content">{title}</p>
      <ul className="space-y-1 text-sm">
        {lista.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />
            <span className="text-content">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DiagnosisModal({
  fingerprintId,
  ticketId,
  onClose,
}: {
  fingerprintId?: number;
  ticketId?: number;
  onClose: () => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ default: string; providers: Provider[] }>("/api/ai/providers")
      .then((d) => {
        const disponibles = d.providers || [];
        setProviders(disponibles);
        const def = disponibles.find((p) => p.id === d.default && p.available);
        setProvider(def?.id || disponibles.find((p) => p.available)?.id || "ollama");
      })
      .catch(() => setProvider("ollama"));
  }, []);

  useEffect(() => {
    if (!provider) return;
    let active = true;
    setData(null);
    setError(null);
    const payload = fingerprintId
      ? { fingerprint_id: fingerprintId, provider }
      : { ticket_id: ticketId, provider };
    const path = fingerprintId ? "/api/ai/diagnose" : "/api/ai/diagnose-ticket";
    api
      .post<Result>(path, payload)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Error");
      });
    return () => {
      active = false;
    };
  }, [fingerprintId, ticketId, provider]);

  const analysis = data?.analysis;
  const confianza = data?.confidence ?? analysis?.confidence;
  const criterio = fingerprintId ? `problema #${fingerprintId}` : `caso Redmine #${(data as TicketResult)?.redmine_id ?? ticketId}`;

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
            <h3 className="text-lg font-semibold text-content">Soluciones sugeridas por IA</h3>
            <p className="text-xs text-content-muted">Diagnóstico asistido · {criterio}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-content-muted">Motor de IA:</span>
          <div className="flex rounded-lg border border-surface-border p-0.5">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.available}
                onClick={() => setProvider(p.id)}
                title={p.available ? `Modelo: ${p.model}` : "No configurado"}
                className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  provider === p.id
                    ? "bg-gob-blue text-white"
                    : "text-content hover:bg-surface-soft"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="card text-gob-error">{error}</div>
        ) : !data || !analysis ? (
          <p className="text-content-muted">Generando diagnóstico…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">IA · {data.provider}{data.model ? ` (${data.model})` : ""}</Badge>
              {typeof confianza === "number" ? (
                <Badge tone={confianza >= 0.6 ? "success" : "warning"}>
                  Confianza {Math.round(confianza * 100)}%
                </Badge>
              ) : null}
            </div>

            {analysis.summary ? (
              <p className="text-sm font-medium text-content">{analysis.summary}</p>
            ) : null}
            {analysis.technical_explanation ? (
              <p className="text-sm text-content-muted">{analysis.technical_explanation}</p>
            ) : null}

            <List title="Causas probables" items={analysis.probable_causes} tone="bg-gob-warning" />

            <div className="rounded-lg border border-surface-border bg-surface-soft p-4">
              <p className="mb-1.5 text-sm font-semibold text-content">Posibles soluciones</p>
              <ul className="space-y-1.5 text-sm">
                {(analysis.recommended_actions || []).map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gob-success" />
                    <span className="text-content">{item}</span>
                  </li>
                ))}
                {!analysis.recommended_actions?.length ? (
                  <li className="text-content-muted">No se generaron acciones.</li>
                ) : null}
              </ul>
            </div>

            <List title="Revisiones recomendadas" items={analysis.recommended_checks} tone="bg-gob-info" />

            {analysis.code_snippet ? (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-content">Fragmento de referencia</p>
                <pre className="overflow-x-auto rounded-lg bg-surface-soft p-3 text-xs text-content">
                  {analysis.code_snippet}
                </pre>
              </div>
            ) : null}

            {analysis.provider_request ? (
              <p className="text-sm text-content-muted">{analysis.provider_request}</p>
            ) : null}

            {isTicket(data) ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-content">Problemas de Graylog relacionados</p>
                {data.related_fingerprints.length === 0 ? (
                  <p className="text-sm text-content-muted">Sin problemas asociados.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.related_fingerprints.map((f) => (
                      <li
                        key={f.fingerprint_id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {f.severidad ? <Badge tone={f.severidad}>{f.severidad}</Badge> : null}
                          <span className="truncate" title={f.problema}>{f.problema}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-content-muted">{f.similitud}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div>
                <p className="mb-2 text-sm font-semibold text-content">Tickets de Redmine asociados</p>
                {data.tickets.length === 0 ? (
                  <p className="text-sm text-content-muted">No se encontraron tickets relacionados en Redmine.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.tickets.map((t) => (
                      <li
                        key={t.redmine_id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {t.url ? (
                              <a href={t.url} target="_blank" rel="noreferrer" className="font-semibold text-gob-info hover:underline">
                                #{t.redmine_id}
                              </a>
                            ) : (
                              <span className="font-semibold">#{t.redmine_id}</span>
                            )}
                            {t.sugerido ? <Badge tone="warning">sugerido</Badge> : <Badge tone="success">relacionado</Badge>}
                          </div>
                          <p className="truncate text-content" title={t.subject}>{t.subject}</p>
                          <p className="text-xs text-content-muted">
                            {[t.status, t.priority, t.assigned_to].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-content-muted">{t.similitud}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!isTicket(data) && data.context?.nagios ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-content">
                  Estado en Nagios (análisis cruzado)
                </p>
                {data.context.nagios.conteo.problemas > 0 ? (
                  <ul className="space-y-1.5 text-sm">
                    {data.context.nagios.servicios_con_problema
                      .slice(0, 12)
                      .map((s, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Badge
                            tone={
                              s.estado === "CRITICAL"
                                ? "error"
                                : s.estado === "WARNING"
                                ? "warning"
                                : "info"
                            }
                          >
                            {s.estado}
                          </Badge>
                          <span className="truncate">
                            {s.host} / {s.servicio}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gob-success">
                    Nagios no reporta problemas ({data.context.nagios.conteo.servicios}{" "}
                    servicios monitoreados).
                  </p>
                )}
              </div>
            ) : null}

            {analysis.advertencia ? (
              <p className="text-xs text-gob-warning">{analysis.advertencia}</p>
            ) : null}
            <p className="text-xs text-content-muted">{data.aviso}</p>
          </div>
        )}
      </div>
    </div>
  );
}
