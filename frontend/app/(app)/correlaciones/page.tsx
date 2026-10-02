"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

type Correlation = {
  id: number;
  fingerprint_id: number;
  score: number;
  method: string | null;
  evidence: string | null;
  ticket: { redmine_id: number; subject: string; status: string | null; closed: boolean } | null;
};

export default function CorrelacionesPage() {
  const [items, setItems] = useState<Correlation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: Correlation[] }>("/api/correlations")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Error"));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-content">Correlaciones Graylog ↔ Redmine</h2>
      {error ? <div className="card text-gob-error">{error}</div> : null}
      <p className="text-sm text-content-muted">
        Similitud de información (no causalidad). Ejecuta el análisis en “Problemas”.
      </p>
      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr><th>Problema (fingerprint)</th><th>Ticket</th><th>Estado</th><th>Similitud</th><th>Método</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.fingerprint_id}</td>
                <td>{c.ticket ? `#${c.ticket.redmine_id} ${c.ticket.subject}` : "—"}</td>
                <td>{c.ticket ? <Badge tone={c.ticket.closed ? "neutral" : "success"}>{c.ticket.status}</Badge> : "—"}</td>
                <td>{c.score}%</td>
                <td>{c.method}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={5} className="text-content-muted">Sin correlaciones aún.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
