"use client";

import { useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { API_URL, api } from "@/lib/api";

type Status = {
  database: { ok: boolean };
  connectors: {
    redmine: { configured: boolean; url: string };
    graylog: { configured: boolean; url: string; streams: string[] };
  };
  ai: { provider: string; configured: boolean };
};

export default function SistemaPage() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Status>("/api/system/status")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-content">Estado del Sistema</h2>
      {error ? <div className="card text-gob-error">{error}</div> : null}
      {!data ? (
        <p className="text-content-muted">Cargando…</p>
      ) : (
        <>
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-content">Base de datos</span>
              <Badge tone={data.database.ok ? "success" : "error"}>
                {data.database.ok ? "OK" : "Sin conexión"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-content">Redmine</span>
              <Badge tone={data.connectors.redmine.configured ? "success" : "neutral"}>
                {data.connectors.redmine.configured ? "Configurado" : "Sin configurar"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-content">Graylog</span>
              <Badge tone={data.connectors.graylog.configured ? "success" : "neutral"}>
                {data.connectors.graylog.configured ? "Configurado" : "Sin configurar"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-content">Motor IA</span>
              <Badge tone={data.ai.configured ? "success" : "neutral"}>
                {data.ai.provider}
              </Badge>
            </div>
          </div>

          <div className="card space-y-2 text-sm">
            <p className="font-medium text-content">Endpoints de observabilidad</p>
            <p>
              <a className="text-gob-info underline" href={`${API_URL}/health`} target="_blank" rel="noopener">
                {API_URL}/health
              </a>
            </p>
            <p>
              <a className="text-gob-info underline" href={`${API_URL}/ready`} target="_blank" rel="noopener">
                {API_URL}/ready
              </a>
            </p>
            <p>
              <a className="text-gob-info underline" href={`${API_URL}/docs`} target="_blank" rel="noopener">
                {API_URL}/docs
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
