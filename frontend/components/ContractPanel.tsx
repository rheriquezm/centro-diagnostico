"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { api, upload } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { exportarInforme, mdToHtml } from "@/lib/report";
import SimpleMarkdown from "@/components/SimpleMarkdown";

type Doc = { id: number; name: string; chars: number; uploaded_at: string };
type Fuente = { documento?: string; fragmento?: string };
type Mensaje = {
  rol: "user" | "assistant";
  texto: string;
  fuentes?: Fuente[];
  tickets?: number[];
  provider?: string;
  confianza?: number | null;
};

export default function ContractPanel() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const d = await api.get<{ documents: Doc[] }>("/api/contracts");
      setDocs(d.documents);
    } catch {
      // opcional
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, asking]);

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const errores: string[] = [];
    let subidos = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgreso(`Subiendo ${i + 1}/${files.length}: ${file.name}`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        await upload("/api/contracts/upload", fd);
        subidos += 1;
      } catch (err) {
        errores.push(
          `${file.name} (${(file.size / 1024).toFixed(0)} KB): ${
            err instanceof Error ? err.message : "error"
          }`
        );
      }
    }
    setMensajes([]);
    await loadDocs();
    if (errores.length) {
      setError(
        `No se pudieron subir ${errores.length} de ${files.length} archivo(s). ` +
          `Los que tienen texto escaneado (imagen) deben pasar por OCR. Detalle: ` +
          errores.join(" | ")
      );
    }
    setProgreso(subidos > 0 ? `${subidos} archivo(s) subido(s).` : "");
    setUploading(false);
    e.target.value = "";
  }

  async function borrar(id: number) {
    try {
      await api.del(`/api/contracts/${id}`);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  async function preguntar() {
    const q = question.trim();
    if (!q || asking || docs.length === 0) return;
    setMensajes((m) => [...m, { rol: "user", texto: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await api.post<{
        respuesta: string;
        fuentes: Fuente[];
        tickets: number[];
        provider: string;
        confianza?: number | null;
      }>("/api/contracts/chat", { question: q });
      setMensajes((m) => [
        ...m,
        {
          rol: "assistant",
          texto: res.respuesta || "(sin respuesta)",
          fuentes: res.fuentes || [],
          tickets: res.tickets || [],
          provider: res.provider,
          confianza: res.confianza,
        },
      ]);
    } catch (err) {
      setMensajes((m) => [
        ...m,
        {
          rol: "assistant",
          texto: `Error: ${err instanceof Error ? err.message : "Error"}`,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function exportar() {
    if (mensajes.length === 0) return;
    const secs = mensajes.map((m) => {
      let html = mdToHtml(m.texto);
      if (m.rol === "assistant" && (m.fuentes || []).length > 0) {
        html +=
          "<h2>Fuentes del contrato</h2>" +
          mdToHtml(
            (m.fuentes || [])
              .map((f) => `- ${f.documento || ""}: "${f.fragmento || ""}"`)
              .join("\n")
          );
      }
      if (m.rol === "assistant" && (m.tickets || []).length > 0) {
        html += `<p><strong>Tickets citados:</strong> ${(m.tickets || [])
          .map((t) => `#${t}`)
          .join(", ")}</p>`;
      }
      return {
        titulo: m.rol === "user" ? "Pregunta" : `Respuesta (${m.provider || "IA"})`,
        html,
      };
    });
    const fecha = new Date().toLocaleDateString("es-CL");
    exportarInforme(`Informe de análisis de garantías — ${fecha}`, [
      {
        titulo: "Documentos analizados",
        html: mdToHtml(docs.map((d) => `- ${d.name}`).join("\n")),
      },
      ...secs,
    ]);
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-content">Documentos y asistente</p>
          <p className="text-xs text-content-muted">
            Sube contratos, anexos y adendas (múltiples). Luego pregunta y la IA
            responde con base en ellos (estilo NotebookLM).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost"
            onClick={exportar}
            disabled={mensajes.length === 0}
          >
            Exportar informe
          </button>
          <label className="btn-ghost cursor-pointer">
            {uploading ? "Subiendo…" : "Subir documentos"}
            <input
              type="file"
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.tif,.tiff"
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {progreso && !error ? (
        <p className="mt-2 text-xs text-content-muted">{progreso}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-gob-error">{error}</p> : null}

      {/* Documentos */}
      <div className="mt-3">
        {docs.length === 0 ? (
          <p className="text-xs text-gob-warning">
            Sin documentos cargados. Sube al menos un archivo para habilitar el asistente.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-soft px-3 py-1.5 text-xs"
              >
                <span className="font-medium text-content">{d.name}</span>
                <span className="text-content-muted">
                  {d.chars.toLocaleString("es-CL")} car.
                </span>
                <span className="hidden text-content-muted sm:inline">
                  {formatDateTime(d.uploaded_at)}
                </span>
                <button
                  className="text-gob-error hover:underline"
                  onClick={() => borrar(d.id)}
                  title="Eliminar documento"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Asistente */}
      <div
        ref={scrollRef}
        className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-surface-border bg-surface-soft/40 p-3"
      >
        {mensajes.length === 0 ? (
          <p className="text-sm text-content-muted">
            Haz una pregunta sobre los documentos (p. ej. «¿Qué cubre la garantía?»
            o «¿Las integraciones nuevas están incluidas?»).
          </p>
        ) : null}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={m.rol === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                m.rol === "user"
                  ? "bg-gob-blue text-white"
                  : "border border-surface-border bg-surface-card text-content"
              }`}
            >
              {m.rol === "assistant" ? (
                <SimpleMarkdown text={m.texto} />
              ) : (
                <p className="whitespace-pre-wrap">{m.texto}</p>
              )}
              {m.rol === "assistant" && (m.fuentes || []).length > 0 ? (
                <div className="mt-2 space-y-1">
                  {(m.fuentes || []).map((f, j) => (
                    <p
                      key={j}
                      className="rounded bg-surface-soft px-2 py-1 text-[11px] text-content-muted"
                    >
                      {f.documento ? (
                        <span className="font-medium text-content">
                          {f.documento}:{" "}
                        </span>
                      ) : null}
                      {f.fragmento}
                    </p>
                  ))}
                </div>
              ) : null}
              {m.rol === "assistant" && (m.tickets || []).length > 0 ? (
                <p className="mt-2 text-[11px] font-medium text-gob-info">
                  Tickets citados:{" "}
                  {(m.tickets || []).map((t) => `#${t}`).join(", ")}
                </p>
              ) : null}
              {m.rol === "assistant" ? (
                <p className="mt-1 text-[10px] text-content-muted">
                  IA: {m.provider}
                  {typeof m.confianza === "number"
                    ? ` · ${Math.round(m.confianza * 100)}%`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {asking ? (
          <p className="text-xs text-content-muted">Consultando los documentos…</p>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              preguntar();
            }
          }}
          placeholder="Pregunta sobre el contrato…"
          disabled={asking || docs.length === 0}
        />
        <button
          className="btn-primary"
          onClick={preguntar}
          disabled={asking || !question.trim() || docs.length === 0}
        >
          {asking ? "…" : "Preguntar"}
        </button>
      </div>
    </section>
  );
}
