"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

type Sla = {
  criticidad: string;
  descripcion: string;
  tiempo_respuesta: string;
  tiempo_resolucion: string;
  penalidad: string;
  nota?: string;
};

type Seccion = { documento: string; texto: string };

const VACIO: Sla = {
  criticidad: "",
  descripcion: "",
  tiempo_respuesta: "",
  tiempo_resolucion: "",
  penalidad: "",
};

export default function SlaPanel() {
  const [slas, setSlas] = useState<Sla[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [docSel, setDocSel] = useState(0);
  const [verTexto, setVerTexto] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api.get<{ slas: Sla[] }>("/api/contracts/slas"),
        api.get<{ secciones: Seccion[] }>("/api/contracts/slas/texto"),
      ]);
      setSlas(a.slas || []);
      setSecciones(b.secciones || []);
    } catch {
      // opcional
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setField(i: number, field: keyof Sla, value: string) {
    setSlas((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    );
  }
  function addRow() {
    setSlas((prev) => [...prev, { ...VACIO }]);
  }
  function removeRow(i: number) {
    setSlas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api.put<{ slas: Sla[] }>("/api/contracts/slas", { slas });
      setSlas(r.slas || []);
      setMessage("SLA guardados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gob-blue text-xs font-bold text-white">
            SLA
          </span>
          <div>
            <p className="font-medium text-content">
              Acuerdos de Nivel de Servicio
            </p>
            <p className="text-xs text-content-muted">
              Referencia permanente · fiel al contrato
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost"
            onClick={() => setVerTexto((v) => !v)}
            disabled={secciones.length === 0}
          >
            {verTexto ? "Ocultar contrato" : "Ver texto del contrato"}
          </button>
          <button className="btn-ghost" onClick={addRow} disabled={busy}>
            + Fila
          </button>
          <button className="btn-primary" onClick={guardar} disabled={busy}>
            Guardar
          </button>
        </div>
      </div>

      {message ? <p className="mb-2 text-xs text-gob-info">{message}</p> : null}
      {error ? <p className="mb-2 text-xs text-gob-error">{error}</p> : null}

      {verTexto && secciones.length > 0 ? (
        <div className="mb-4 rounded-xl border border-surface-border bg-surface-soft/40 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {secciones.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDocSel(i)}
                className={`rounded-md px-2 py-1 text-[11px] transition ${
                  docSel === i
                    ? "bg-gob-blue text-white"
                    : "border border-surface-border text-content hover:bg-surface-card"
                }`}
              >
                {s.documento}
              </button>
            ))}
          </div>
          <div className="max-h-52 overflow-auto rounded-lg border border-surface-border bg-surface-card p-3">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-content">
              {secciones[docSel]?.texto || ""}
            </pre>
          </div>
        </div>
      ) : null}

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-28">Criticidad</th>
              <th>Descripción</th>
              <th className="w-36">T. respuesta</th>
              <th className="w-36">T. resolución</th>
              <th className="w-40">Penalidad</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {slas.map((s, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="input"
                    value={s.criticidad || ""}
                    onChange={(e) => setField(i, "criticidad", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={s.descripcion || ""}
                    onChange={(e) => setField(i, "descripcion", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={s.tiempo_respuesta || ""}
                    onChange={(e) => setField(i, "tiempo_respuesta", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={s.tiempo_resolucion || ""}
                    onChange={(e) =>
                      setField(i, "tiempo_resolucion", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={s.penalidad || ""}
                    onChange={(e) => setField(i, "penalidad", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    className="text-gob-error hover:underline"
                    onClick={() => removeRow(i)}
                    title="Eliminar fila"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {slas.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-content-muted">
                  Sin filas. Agrega manualmente o{" "}
                  <button
                    className="text-gob-info hover:underline"
                    onClick={load}
                  >
                    recarga desde el contrato
                  </button>
                  .
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
