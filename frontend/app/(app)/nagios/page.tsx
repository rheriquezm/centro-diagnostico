"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";

type HostItem = { host: string; estado: string; salida: string };
type ServiceItem = { host: string; servicio: string; estado: string; salida: string };
type AlertItem = {
  tipo: "host" | "servicio";
  host: string;
  servicio?: string;
  estado: string;
  salida: string;
};

type Summary = {
  hosts: HostItem[];
  services: ServiceItem[];
  host_counts: Record<string, number>;
  service_counts: Record<string, number>;
  hosts_total: number;
  services_total: number;
  alertas: AlertItem[];
  problemas: number;
};

function tono(estado: string): string {
  switch (estado) {
    case "OK":
    case "UP":
      return "success";
    case "WARNING":
      return "warning";
    case "CRITICAL":
    case "DOWN":
    case "UNREACHABLE":
      return "error";
    default:
      return "info";
  }
}

const ORDEN_ESTADO = ["CRITICAL", "DOWN", "UNREACHABLE", "WARNING", "UNKNOWN", "PENDING", "OK", "UP"];

function ordenarPorEstado<T extends { estado: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado)
  );
}

export default function NagiosPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Summary>("/api/nagios/summary");
      setData(res);
      setActualizado(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const serviciosMostrados = data
    ? ordenarPorEstado(data.services).filter(
        (s) =>
          !filtro ||
          s.estado === filtro ||
          s.host.toLowerCase().includes(filtro.toLowerCase()) ||
          s.servicio.toLowerCase().includes(filtro.toLowerCase())
      )
    : [];

  const hc = data?.host_counts || {};
  const sc = data?.service_counts || {};

  const donutServicios = Object.entries(sc).map(([nombre, total]) => ({
    nombre,
    total,
    color: { OK: "#2c8c3a", WARNING: "#f6a500", CRITICAL: "#d93025", UNKNOWN: "#007bff" }[
      nombre
    ],
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-content">Nagios</h2>
          <p className="text-sm text-content-muted">
            Monitoreo de hosts y servicios (actualiza cada 60 s)
            {actualizado ? ` · últ. ${actualizado.toLocaleTimeString("es-CL")}` : ""}
          </p>
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Hosts" value={data?.hosts_total ?? "—"} hint={`Up: ${hc.UP || 0}`} />
        <KpiCard
          label="Hosts caídos"
          value={(hc.DOWN || 0) + (hc.UNREACHABLE || 0)}
          hint={`Down ${hc.DOWN || 0} · Unreach ${hc.UNREACHABLE || 0}`}
        />
        <KpiCard
          label="Servicios críticos"
          value={sc.CRITICAL || 0}
          hint={`Total servicios: ${data?.services_total ?? 0}`}
        />
        <KpiCard
          label="Advertencias"
          value={sc.WARNING || 0}
          hint={`OK: ${sc.OK || 0} · Unknown: ${sc.UNKNOWN || 0}`}
        />
      </div>

      {/* Cuadro de alertas */}
      <section
        className={`card border-l-4 ${
          (data?.problemas ?? 0) > 0 ? "border-l-gob-error" : "border-l-gob-success"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-content">Cuadro de alertas</p>
          <span
            className={`text-xs font-medium ${
              (data?.problemas ?? 0) > 0 ? "text-gob-error" : "text-gob-success"
            }`}
          >
            {data ? (data.problemas > 0 ? `${data.problemas} alertas activas` : "Sin alertas activas") : ""}
          </span>
        </div>

        {data && data.alertas.length > 0 ? (
          <div className="overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Host</th>
                  <th>Servicio</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.alertas.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <Badge tone={tono(a.estado)}>{a.estado}</Badge>
                    </td>
                    <td className="text-content-muted">{a.tipo}</td>
                    <td className="font-medium">{a.host}</td>
                    <td>{a.servicio || "—"}</td>
                    <td className="max-w-[520px] text-xs text-content-muted">{a.salida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <p className="text-sm text-gob-success">
            Todos los hosts y servicios reportan OK.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Servicios por estado</p>
          <Donut centerLabel="Servicios" data={donutServicios} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Hosts</p>
          <ul className="space-y-2 text-sm">
            {(data?.hosts || []).map((h) => (
              <li key={h.host} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium" title={h.host}>
                  {h.host}
                </span>
                <Badge tone={tono(h.estado)}>{h.estado}</Badge>
              </li>
            ))}
            {(data?.hosts || []).length === 0 ? (
              <li className="text-content-muted">Sin datos.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-content">Servicios</p>
          <input
            className="input max-w-[260px]"
            placeholder="Filtrar por host, servicio o estado…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Host</th>
                <th>Servicio</th>
                <th>Salida</th>
              </tr>
            </thead>
            <tbody>
              {serviciosMostrados.map((s, i) => (
                <tr key={`${s.host}-${s.servicio}-${i}`}>
                  <td>
                    <Badge tone={tono(s.estado)}>{s.estado}</Badge>
                  </td>
                  <td>{s.host}</td>
                  <td>{s.servicio}</td>
                  <td className="max-w-[640px] text-xs text-content-muted">{s.salida}</td>
                </tr>
              ))}
              {serviciosMostrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-content-muted">
                    Sin servicios que coincidan.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
