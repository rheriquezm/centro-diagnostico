"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import Donut from "@/components/Donut";
import { api } from "@/lib/api";

type HostMetric = {
  host: string;
  memoria_pct: number | null;
  swap_pct: number | null;
  cpu_pct: number | null;
  discos: Array<{ nombre: string | null; usado_pct: number }>;
};

type Data = {
  hosts: Array<{ host: string; estado: string }>;
  host_counts: Record<string, number>;
  service_counts: Record<string, number>;
  treemap: Array<{ host: string; servicio: string; estado: string }>;
  host_metrics: HostMetric[];
};

const ESTADO_COLOR: Record<string, string> = {
  OK: "#2c8c3a",
  UP: "#2c8c3a",
  WARNING: "#f6a500",
  PENDING: "#f6a500",
  CRITICAL: "#d93025",
  DOWN: "#d93025",
  UNREACHABLE: "#b91c1c",
  UNKNOWN: "#007bff",
};

function Bar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const v = value ?? null;
  const tone =
    v === null ? "#64748b" : v >= 85 ? "#d93025" : v >= 70 ? "#f6a500" : "#2c8c3a";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-content-muted">{label}</span>
        <span className="tabular-nums text-content">
          {v === null ? "—" : `${v}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(v ?? 0, 100)}%`, background: tone }}
        />
      </div>
    </div>
  );
}

export default function NagiosMetrics() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setError(null);
    try {
      const d = await api.get<Data>(
        `/api/nagios/metricas${force ? "?refresh=true" : ""}`
      );
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sc = data?.service_counts || {};
  const hc = data?.host_counts || {};
  const svcData = ["OK", "WARNING", "CRITICAL", "UNKNOWN"].map((k) => ({
    nombre: k,
    total: sc[k] || 0,
    color: ESTADO_COLOR[k],
  }));
  const hostData = ["UP", "PENDING", "DOWN", "UNREACHABLE"].map((k) => ({
    nombre: k,
    total: hc[k] || 0,
    color: ESTADO_COLOR[k],
  }));
  const hostEstado = new Map(
    (data?.hosts || []).map((h) => [h.host, h.estado])
  );

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-content">Métricas y consumo</p>
          <p className="text-xs text-content-muted">
            Estado de servicios y consumo de recursos por host.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => load(true)}>
          Actualizar
        </button>
      </div>

      {error ? <p className="mb-2 text-xs text-gob-error">{error}</p> : null}

      {!data ? (
        <p className="text-sm text-content-muted">Cargando métricas…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
                Servicios
              </p>
              <Donut centerLabel="Servicios" data={svcData} size={140} thickness={18} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
                Hosts
              </p>
              <Donut centerLabel="Hosts" data={hostData} size={140} thickness={18} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
                Servicios por estado (treemap)
              </p>
              <div className="grid max-h-40 grid-cols-3 gap-1 overflow-auto sm:grid-cols-4">
                {data.treemap.map((t, i) => (
                  <div
                    key={i}
                    className="flex min-h-[46px] flex-col justify-end rounded p-1.5 text-[9px] text-white"
                    style={{ background: ESTADO_COLOR[t.estado] || "#64748b" }}
                    title={`${t.host} · ${t.servicio} · ${t.estado}`}
                  >
                    <span className="line-clamp-2 leading-tight">{t.servicio}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
              Consumo por host
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.host_metrics.map((h) => (
                <div
                  key={h.host}
                  className="rounded-xl border border-surface-border bg-surface-soft/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-content" title={h.host}>
                      {h.host}
                    </span>
                    <Badge
                      tone={
                        hostEstado.get(h.host) === "UP"
                          ? "success"
                          : hostEstado.get(h.host) === "PENDING"
                          ? "warning"
                          : "error"
                      }
                    >
                      {hostEstado.get(h.host) || "?"}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Bar label="Memoria" value={h.memoria_pct} />
                    <Bar label="CPU" value={h.cpu_pct} />
                    <Bar label="Swap" value={h.swap_pct} />
                    {h.discos.map((d, i) => (
                      <Bar key={i} label={`Disco ${d.nombre || ""}`} value={d.usado_pct} />
                    ))}
                    {h.memoria_pct === null &&
                    h.cpu_pct === null &&
                    h.discos.length === 0 ? (
                      <p className="text-xs text-content-muted">Sin métricas.</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
