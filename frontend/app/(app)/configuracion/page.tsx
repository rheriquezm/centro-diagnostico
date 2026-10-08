"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

type MappingData = {
  graylog_hosts: string[];
  nagios_hosts: string[];
  mapping: Record<string, string>;
};

export default function ConfiguracionPage() {
  const [data, setData] = useState<MappingData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<MappingData>("/api/system/host-mapping");
      setData(d);
      setMapping(d.mapping || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.put("/api/system/host-mapping", { mapping });
      setMessage("Equivalencias guardadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-content">Configuración</h2>
        <p className="text-sm text-content-muted">
          Parámetros no sensibles. Las credenciales se gestionan en <code>.env</code>.
        </p>
      </div>

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <section className="card">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-content">
            Equivalencias de host Graylog ↔ Nagios
          </p>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <p className="mb-4 text-xs text-content-muted">
          Para el análisis cruzado: asocia cada host de Graylog (columna izquierda) con su
          host homólogo en Nagios. Déjalo vacío si no aplica.
        </p>

        <datalist id="nagios-hosts">
          {(data?.nagios_hosts || []).map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>

        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Host Graylog</th>
                <th>Host Nagios</th>
              </tr>
            </thead>
            <tbody>
              {(data?.graylog_hosts || []).map((g) => (
                <tr key={g}>
                  <td className="font-mono">{g}</td>
                  <td>
                    <input
                      className="input"
                      list="nagios-hosts"
                      placeholder="(sin equivalencia)"
                      value={mapping[g] || ""}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [g]: e.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {(data?.graylog_hosts || []).length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-content-muted">
                    Sin hosts de Graylog registrados (sincroniza Graylog primero).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <p className="font-medium text-content">Hosts disponibles en Nagios</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(data?.nagios_hosts || []).map((h) => (
            <span
              key={h}
              className="rounded-full border border-surface-border px-2 py-0.5 text-xs text-content-muted"
            >
              {h}
            </span>
          ))}
          {(data?.nagios_hosts || []).length === 0 ? (
            <span className="text-sm text-content-muted">Nagios sin configurar.</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
