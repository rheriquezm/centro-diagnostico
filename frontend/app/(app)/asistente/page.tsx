"use client";

import { useState } from "react";

import { api } from "@/lib/api";

type AssistantResponse = {
  provider: string;
  respuesta: {
    answer?: string;
    summary?: string;
    references?: Array<{ tipo: string; valor: unknown }>;
    raw?: Record<string, unknown>;
  };
  aviso: string;
};

const EJEMPLOS = [
  "¿Cuáles son los principales problemas?",
  "¿Existen tickets cerrados cuyo error continúe?",
  "¿Qué debería solicitar al proveedor?",
  "¿Qué componente presenta más fallas?",
];

export default function AsistentePage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<AssistantResponse>("/api/assistant/ask", { question: text });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-content">Asistente de Diagnóstico</h2>
      <p className="text-sm text-content-muted">
        Las respuestas se anclan al contexto real (fingerprints, hallazgos y tickets). No inventa datos.
      </p>

      <form
        className="card flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          className="input flex-1"
          placeholder="Escribe una pregunta…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Analizando…" : "Preguntar"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EJEMPLOS.map((e) => (
          <button key={e} className="btn-ghost" onClick={() => { setQuestion(e); ask(e); }}>
            {e}
          </button>
        ))}
      </div>

      {error ? <div className="card text-gob-error">{error}</div> : null}

      {result ? (
        <div className="card space-y-2">
          <p className="text-sm text-content-muted">Proveedor: {result.provider}</p>
          <p className="whitespace-pre-wrap text-content">
            {result.respuesta.answer || result.respuesta.summary || "Sin respuesta."}
          </p>
          {result.respuesta.references && result.respuesta.references.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm text-content-muted">Referencias usadas</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-xs">
{JSON.stringify(result.respuesta.references, null, 2)}
              </pre>
            </details>
          ) : null}
          <p className="text-xs text-content-muted">{result.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}
