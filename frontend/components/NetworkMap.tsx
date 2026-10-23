"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import { api } from "@/lib/api";

type Nodo = {
  id: string;
  nombre: string;
  direccion: string | null;
  estado: string | null;
  servicios: number;
  capa: number;
  rol: string;
};

type Topo = {
  nodos: Nodo[];
  conexiones: Array<{ from: string; to: string }>;
  inferida: boolean;
  nota: string;
};

function colorEstado(estado: string | null): string {
  switch (estado) {
    case "UP":
      return "#2c8c3a";
    case "PENDING":
      return "#f6a500";
    case "DOWN":
      return "#d93025";
    case "UNREACHABLE":
      return "#b91c1c";
    default:
      return "#64748b";
  }
}

function cut(texto: string, n: number): string {
  return texto.length > n ? `${texto.slice(0, n - 1)}…` : texto;
}

const NODE_W = 176;
const NODE_H = 82;
const GAP_X = 96;
const GAP_Y = 26;
const PAD = 28;

export default function NetworkMap() {
  const [data, setData] = useState<Topo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setError(null);
    try {
      const d = await api.get<Topo>(
        `/api/nagios/topologia${force ? "?refresh=true" : ""}`
      );
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nodos = data?.nodos || [];
  const main = nodos.filter((n) => n.capa !== 9);
  const admin = nodos.filter((n) => n.capa === 9);
  const capas = Array.from(new Set(main.map((n) => n.capa))).sort(
    (a, b) => a - b
  );
  const filas = Math.max(
    ...capas.map((c) => main.filter((n) => n.capa === c).length),
    1
  );
  const contentH = filas * NODE_H + (filas - 1) * GAP_Y;
  const width = Math.max(
    PAD * 2 + capas.length * (NODE_W + GAP_X) - (capas.length ? GAP_X : 0),
    NODE_W + PAD * 2
  );
  const height =
    PAD * 2 + contentH + (admin.length ? NODE_H + 56 : 0);

  const pos: Record<string, { x: number; y: number }> = {};
  capas.forEach((c, ci) => {
    const arr = main.filter((n) => n.capa === c);
    const colH = arr.length * NODE_H + (arr.length - 1) * GAP_Y;
    const x = PAD + ci * (NODE_W + GAP_X);
    const y0 = PAD + (contentH - colH) / 2;
    arr.forEach((n, ri) => {
      pos[n.id] = { x, y: y0 + ri * (NODE_H + GAP_Y) };
    });
  });
  admin.forEach((n, ai) => {
    pos[n.id] = {
      x: PAD,
      y: PAD + contentH + 56 + ai * (NODE_H + GAP_Y),
    };
  });

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-content">Network Status Map</p>
          <p className="text-xs text-content-muted">
            Mapa de nodos y conexiones (orden de flujo).
          </p>
        </div>
        <button className="btn-ghost" onClick={() => load(true)}>
          Actualizar
        </button>
      </div>

      {error ? <p className="mb-2 text-xs text-gob-error">{error}</p> : null}

      {!data ? (
        <p className="text-sm text-content-muted">Cargando mapa…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="min-w-full"
              style={{ minWidth: Math.min(width, 640), maxWidth: width }}
              role="img"
              aria-label="Mapa de estados de red Nagios"
            >
              <defs>
                <marker
                  id="nsm-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#003390" />
                </marker>
              </defs>

              {data.conexiones.map((c, i) => {
                const a = pos[c.from];
                const b = pos[c.to];
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={`e-${i}`}
                    d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke="#003390"
                    strokeOpacity="0.55"
                    strokeWidth="2"
                    markerEnd="url(#nsm-arrow)"
                  />
                );
              })}

              {admin.length > 0 ? (
                <line
                  x1={PAD}
                  x2={width - PAD}
                  y1={PAD + contentH + 24}
                  y2={PAD + contentH + 24}
                  stroke="var(--surface-border)"
                  strokeDasharray="4 4"
                />
              ) : null}

              {nodos.map((n) => {
                const p = pos[n.id];
                if (!p) return null;
                const color = colorEstado(n.estado);
                const esAdmin = n.capa === 9;
                return (
                  <g key={n.id}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      style={{ fill: "var(--surface-card)" }}
                      stroke={color}
                      strokeWidth={esAdmin ? 1.5 : 2.5}
                      strokeDasharray={esAdmin ? "5 4" : undefined}
                    />
                    <circle cx={p.x + 16} cy={p.y + 18} r={5} fill={color} />
                    <text
                      x={p.x + 30}
                      y={p.y + 22}
                      fontSize="12"
                      fontWeight="700"
                      style={{ fill: "var(--text)" }}
                    >
                      {cut(n.nombre, 20)}
                    </text>
                    <text
                      x={p.x + 14}
                      y={p.y + 44}
                      fontSize="10"
                      fontFamily="monospace"
                      style={{ fill: "var(--text-muted)" }}
                    >
                      {n.direccion || "—"}
                    </text>
                    <text
                      x={p.x + 14}
                      y={p.y + 64}
                      fontSize="10"
                      style={{ fill: "var(--text-muted)" }}
                    >
                      {esAdmin ? "Acceso administrativo" : `${n.servicios} servicios · ${n.estado || "?"}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-content-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2c8c3a" }} />
              UP
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f6a500" }} />
              PENDING
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d93025" }} />
              DOWN
            </span>
            {data.inferida ? (
              <Badge tone="warning">Topología inferida</Badge>
            ) : (
              <Badge tone="success">Según Nagios (parents)</Badge>
            )}
            <span>{data.nota}</span>
          </div>
        </>
      )}
    </section>
  );
}
