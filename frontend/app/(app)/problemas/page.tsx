"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type TicketRef = {
  redmine_id: number;
  subject: string;
  status: string | null;
  priority: string | null;
  closed: boolean;
  similitud: number | null;
};

type Problem = {
  id: number;
  severidad: string;
  problema: string;
  exception_type: string | null;
  aplicacion: string | null;
  servicio: string | null;
  ocurrencias: number;
  primera: string | null;
  ultima: string | null;
  tendencia: string | null;
  ticket: TicketRef | null;
  sin_ticket: boolean;
  reincidencia: boolean;
  nuevo: boolean;
  recurrente: boolean;
};

type Detail = {
  fingerprint: Record<string, unknown> & {
    template?: string;
    sample_stack?: string;
    ocurrencias?: number;
  };
  tickets: Array<TicketRef & { closed_on?: string; evidencia?: string }>;
  findings: Array<{ type: string; title: string; detail: string }>;
};

type Diagnosis = {
  provider: string;
  confidence: number | null;
  analysis: {
    summary?: string;
    technical_explanation?: string;
    probable_causes?: string[];
    recommended_checks?: string[];
    recommended_actions?: string[];
    provider_request?: string;
    severity_reasoning?: string;
    code_snippet?: string | null;
    advertencia?: string;
  };
};

export default function ProblemasPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [q, setQ] = useState("");
  const [severidad, setSeveridad] = useState("");
  const [conTicket, setConTicket] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (severidad) params.set("severidad", severidad);
      if (conTicket) params.set("con_ticket", conTicket === "si" ? "true" : "false");
      const data = await api.get<{ items: Problem[]; total: number }>(
        `/api/problems?${params.toString()}`
      );
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [q, severidad, conTicket]);

  useEffect(() => {
    load();
  }, [load]);

  async function runPipeline() {
    setError(null);
    setMessage("Ejecutando correlación y detección de hallazgos…");
    try {
      await api.post("/api/pipeline/run", {});
      setMessage("Análisis completado.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function verDetalle(id: number) {
    setSelected(id);
    setDiagnosis(null);
    setDetail(null);
    try {
      const data = await api.get<Detail>(`/api/problems/${id}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function analizarIA() {
    if (!selected) return;
    setDiagnosis(null);
    try {
      const data = await api.post<Diagnosis>("/api/ai/diagnose", { fingerprint_id: selected });
      setDiagnosis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-content">Problemas</h2>
        <button className="btn-primary" onClick={runPipeline}>
          Ejecutar análisis (correlación + hallazgos)
        </button>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Buscar</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-content-muted">Severidad</label>
          <select className="input" value={severidad} onChange={(e) => setSeveridad(e.target.value)}>
            <option value="">Todas</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="FATAL">FATAL</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-content-muted">Ticket</label>
          <select className="input" value={conTicket} onChange={(e) => setConTicket(e.target.value)}>
            <option value="">Todos</option>
            <option value="si">Con ticket</option>
            <option value="no">Sin ticket</option>
          </select>
        </div>
        <button className="btn-primary" type="submit">Filtrar</button>
      </form>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Sev.</th><th>Problema</th><th>Aplicación</th><th>Servicio</th>
              <th>Ocurr.</th><th>Primera</th><th>Última</th><th>Tend.</th>
              <th>Ticket</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td><Badge tone={p.severidad}>{p.severidad}</Badge></td>
                <td className="max-w-[320px]">{p.problema}</td>
                <td>{p.aplicacion}</td>
                <td>{p.servicio || "—"}</td>
                <td>{p.ocurrencias}</td>
                <td>{formatDateTime(p.primera)}</td>
                <td>{formatDateTime(p.ultima)}</td>
                <td>{p.tendencia || "—"}</td>
                <td>{p.ticket ? `#${p.ticket.redmine_id}` : <span className="text-gob-warning">sin ticket</span>}</td>
                <td>
                  {p.ticket ? <Badge tone={p.ticket.closed ? "neutral" : "success"}>{p.ticket.status}</Badge> : "—"}
                  {p.reincidencia ? <Badge tone="error">reincidencia</Badge> : null}
                </td>
                <td>
                  <button className="btn-ghost" onClick={() => verDetalle(p.id)}>Ver</button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={11} className="text-content-muted">Sin problemas. Sincroniza Graylog y ejecuta el análisis.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-content">Detalle del problema</h3>
          <p className="text-sm text-content-muted">{String(detail.fingerprint.template || "")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={analizarIA}>Analizar con IA</button>
          </div>

          <h4 className="font-medium text-content">Tickets relacionados</h4>
          {detail.tickets.length === 0 ? (
            <p className="text-sm text-content-muted">Sin tickets relacionados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {detail.tickets.map((t) => (
                <li key={t.redmine_id}>
                  #{t.redmine_id} · {t.subject} · {t.status} · similitud {t.similitud}%
                  {t.closed ? " · CERRADO" : ""}
                </li>
              ))}
            </ul>
          )}

          <h4 className="font-medium text-content">Evidencia (stack trace)</h4>
          <pre className="max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-xs">
{String(detail.fingerprint.sample_stack || "sin stack")}
          </pre>

          {diagnosis ? (
            <div className="rounded-xl border border-surface-border p-4">
              <p className="mb-2 text-sm text-content-muted">
                Proveedor: {diagnosis.provider} · confianza {diagnosis.confidence ?? "—"}
              </p>
              <p className="font-medium text-content">{diagnosis.analysis.summary}</p>
              <p className="mt-1 text-sm">{diagnosis.analysis.technical_explanation}</p>
              <h5 className="mt-3 font-medium text-content">Causas probables</h5>
              <ul className="list-disc pl-5 text-sm">
                {(diagnosis.analysis.probable_causes || []).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <h5 className="mt-3 font-medium text-content">Validaciones recomendadas</h5>
              <ul className="list-disc pl-5 text-sm">
                {(diagnosis.analysis.recommended_checks || []).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <h5 className="mt-3 font-medium text-content">Soluciones sugeridas</h5>
              <ul className="list-disc pl-5 text-sm">
                {(diagnosis.analysis.recommended_actions || []).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              {diagnosis.analysis.provider_request ? (
                <p className="mt-3 text-sm"><strong>Acción para proveedor:</strong> {diagnosis.analysis.provider_request}</p>
              ) : null}
              {diagnosis.analysis.code_snippet ? (
                <pre className="mt-3 overflow-auto rounded-lg bg-black/40 p-3 text-xs">{diagnosis.analysis.code_snippet}</pre>
              ) : null}
              {diagnosis.analysis.advertencia ? (
                <p className="mt-2 text-xs text-gob-warning">{diagnosis.analysis.advertencia}</p>
              ) : null}
              <p className="mt-3 text-xs text-content-muted">
                Diagnóstico asistido (hipótesis). Verifica con la evidencia antes de actuar.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
