"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

type KbEntry = {
  id: number;
  fingerprint: string;
  problem: string | null;
  cause: string | null;
  solution: string | null;
  verified: boolean;
};

export default function ConocimientoPage() {
  const [items, setItems] = useState<KbEntry[]>([]);
  const [form, setForm] = useState({ fingerprint: "", problem: "", cause: "", solution: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: KbEntry[] }>("/api/knowledge");
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/api/knowledge", { ...form, verified: true });
      setForm({ fingerprint: "", problem: "", cause: "", solution: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-content">Base de Conocimiento</h2>
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <form className="card grid gap-3 md:grid-cols-2" onSubmit={create}>
        <input className="input" placeholder="Fingerprint" value={form.fingerprint} onChange={(e) => setForm({ ...form, fingerprint: e.target.value })} required />
        <input className="input" placeholder="Problema" value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
        <input className="input" placeholder="Causa" value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} />
        <input className="input" placeholder="Solución aplicada" value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} />
        <button className="btn-primary md:col-span-2" type="submit">Registrar solución</button>
      </form>

      <div className="overflow-auto">
        <table className="table">
          <thead><tr><th>Fingerprint</th><th>Problema</th><th>Causa</th><th>Solución</th><th>Verificado</th></tr></thead>
          <tbody>
            {items.map((k) => (
              <tr key={k.id}>
                <td className="font-mono text-xs">{k.fingerprint.slice(0, 12)}…</td>
                <td>{k.problem}</td>
                <td>{k.cause}</td>
                <td>{k.solution}</td>
                <td>{k.verified ? <Badge tone="success">sí</Badge> : "—"}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={5} className="text-content-muted">Sin entradas aún.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
