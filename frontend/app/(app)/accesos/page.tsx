"use client";

import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/Badge";
import BarChart from "@/components/BarChart";
import BarList from "@/components/BarList";
import ConnectorStatusBar from "@/components/ConnectorStatusBar";
import Donut from "@/components/Donut";
import KpiCard from "@/components/KpiCard";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useConnections } from "@/lib/useConnections";

function serieHoras(items: Array<{ hora: number; total: number }>) {
  const map = new Map(items.map((i) => [i.hora, i.total]));
  return Array.from({ length: 24 }, (_, h) => ({ label: h, value: map.get(h) || 0 }));
}

function tipoEvento(items: Array<{ nombre: string; total: number }>) {
  const ordenado = [...items].sort((a, b) => b.total - a.total);
  const top = ordenado.slice(0, 5);
  const resto = ordenado.slice(5).reduce((acc, i) => acc + i.total, 0);
  return resto > 0 ? [...top, { nombre: "Otros", total: resto }] : top;
}

const RANGOS = [
  { value: "1h", label: "Última hora" },
  { value: "8h", label: "Últimas 8 h" },
  { value: "12h", label: "Últimas 12 h" },
  { value: "24h", label: "Últimas 24 h" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
];

function rangeQuery(rango: string): string {
  const n = parseInt(rango, 10);
  const q = new URLSearchParams();
  if (rango.endsWith("h")) q.set("horas", String(n));
  else q.set("dias", String(n));
  return q.toString();
}

type Record = {
  id: number;
  fecha: string | null;
  dispositivo: string | null;
  area: string | null;
  evento: string | null;
  usuario: string;
  pin: string | null;
  tarjeta: string | null;
  modo: string | null;
  lector: string | null;
};

type Grupo = { nombre: string; total: number };

type Resumen = {
  total: number;
  aperturas: number;
  denegados: number;
  por_evento: Grupo[];
  por_dispositivo: Grupo[];
  por_area: Grupo[];
  por_usuario: Grupo[];
  por_hora: Array<{ hora: number; total: number }>;
};

type NoRegRegistro = {
  fecha: string | null;
  tarjeta: string | null;
  pin: string | null;
  dispositivo: string | null;
  area: string | null;
  lector: string | null;
  modo: string | null;
};

type NoRegGrupo = {
  clave: string;
  id: string | null;
  id_tipo: "pin" | "tarjeta" | "huella";
  pin: string | null;
  tarjeta: string | null;
  total: number;
  primera: string | null;
  ultima: string | null;
  dispositivos: string[];
  modos: string[];
  areas: string[];
  registros: NoRegRegistro[];
};

type NoRegData = { total: number; grupos: NoRegGrupo[] };

type UsuarioItem = { pin: string; nombre: string; total: number; ultima: string | null };

type UsuarioHist = {
  pin: string;
  nombre: string;
  total: number;
  registros: Array<{
    fecha: string | null;
    evento: string | null;
    dispositivo: string | null;
    area: string | null;
    lector: string | null;
    modo: string | null;
    tarjeta: string | null;
  }>;
};

function esDenegado(evento: string | null): boolean {
  const texto = (evento || "").toLowerCase();
  return ["no registrado", "denegad", "rechaz", "denied", "ilegal", "caduc"].some((t) =>
    texto.includes(t)
  );
}

function esApertura(evento: string | null): boolean {
  return (evento || "").toLowerCase().includes("apertura");
}

function esBotonSalida(evento: string | null): boolean {
  const t = (evento || "").toLowerCase();
  return t.includes("botón de salida") || t.includes("boton de salida");
}

function tonoEvento(evento: string | null): string {
  if (esDenegado(evento)) return "error";
  if (esBotonSalida(evento)) return "info";
  if (esApertura(evento)) return "success";
  return "neutral";
}

export default function AccesosPage() {
  const [rango, setRango] = useState("24h");
  const [records, setRecords] = useState<Record[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [noReg, setNoReg] = useState<NoRegData | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtroTarjeta, setFiltroTarjeta] = useState("");
  const [filtroPin, setFiltroPin] = useState("");
  const [dispositivo, setDispositivo] = useState("");
  const [area, setArea] = useState("");
  const [evento, setEvento] = useState("");
  const [usuario, setUsuario] = useState("");
  const [incluirNoReg, setIncluirNoReg] = useState(false);
  const [usuarioSel, setUsuarioSel] = useState<string | null>(null);
  const [usuarioHist, setUsuarioHist] = useState<UsuarioHist | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const { data: conn, refresh: refreshConn, runSync } = useConnections();

  const load = useCallback(async () => {
    try {
      const rangeQS = rangeQuery(rango);
      const params = new URLSearchParams(rangeQS);
      if (dispositivo) params.set("dispositivo", dispositivo);
      if (area) params.set("area", area);
      if (evento) params.set("evento", evento);
      if (usuario) params.set("usuario", usuario);
      if (filtroTarjeta) params.set("tarjeta", filtroTarjeta);
      if (filtroPin) params.set("pin", filtroPin);
      params.set("excluir_no_registrados", incluirNoReg ? "false" : "true");

      const [rec, res, nr, us] = await Promise.all([
        api.get<{ items: Record[] }>(`/api/zkbio/records?${params.toString()}`),
        api.get<Resumen>(`/api/zkbio/resumen?${rangeQS}`),
        api.get<NoRegData>(`/api/zkbio/no-registrados?${rangeQS}`),
        api.get<{ items: UsuarioItem[] }>(`/api/zkbio/usuarios?${rangeQS}`),
      ]);
      setRecords(rec.items);
      setResumen(res);
      setNoReg(nr);
      setUsuarios(us.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }, [rango, dispositivo, area, evento, usuario, filtroTarjeta, filtroPin, incluirNoReg]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistorial = useCallback(
    async (pin: string) => {
      try {
        const data = await api.get<UsuarioHist>(
          `/api/zkbio/usuario/${encodeURIComponent(pin)}?${rangeQuery(rango)}`
        );
        setUsuarioHist(data);
      } catch {
        setUsuarioHist(null);
      }
    },
    [rango]
  );

  useEffect(() => {
    if (usuarioSel) loadHistorial(usuarioSel);
  }, [usuarioSel, loadHistorial]);

  async function testConnection() {
    setError(null);
    setMessage(null);
    setTesting(true);
    try {
      const info = await api.get<{ eventos_hoy: number }>("/api/zkbio/test");
      setMessage(`Conexión OK · eventos de hoy: ${info.eventos_hoy}`);
      await refreshConn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setTesting(false);
    }
  }

  async function sync() {
    setError(null);
    setMessage("Sincronización iniciada; procesando…");
    setSyncing(true);
    try {
      const run = await runSync("zkbio", () =>
        api.post(`/api/zkbio/sync?days=7`, {})
      );
      if (run && run.status === "error") {
        setError(run.error || "La sincronización falló.");
        setMessage(null);
      } else if (run) {
        setMessage(`Sincronización completada · ${run.items} eventos nuevos.`);
      } else {
        setMessage("Sincronización en curso; el estado se actualizará en breve.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setMessage(null);
    } finally {
      setSyncing(false);
    }
  }

  function seleccionarNoReg(g: NoRegGrupo) {
    const activo = expandido === g.clave;
    if (activo) {
      setExpandido(null);
      setFiltroTarjeta("");
      setFiltroPin("");
    } else {
      setExpandido(g.clave);
      setFiltroTarjeta(g.tarjeta || "");
      setFiltroPin(g.pin || "");
    }
  }

  function verHistorial(pin: string) {
    if (usuarioSel === pin) {
      setUsuarioSel(null);
      setUsuarioHist(null);
    } else {
      setUsuarioHist(null);
      setUsuarioSel(pin);
    }
  }

  const maxNoReg = Math.max(...(noReg?.grupos.map((g) => g.total) || [1]), 1);
  const maxUsuario = Math.max(...usuarios.map((u) => u.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-content">Control de Acceso (ZKBio)</h2>
        <div className="flex items-center gap-2">
          <select
            className="input max-w-[170px]"
            value={rango}
            onChange={(e) => setRango(e.target.value)}
          >
            {RANGOS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={testConnection} disabled={testing || syncing}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button className="btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      <ConnectorStatusBar
        info={conn?.connectors?.zkbio}
        scheduler={conn?.scheduler}
        busy={syncing}
      />

      {message ? <div className="card text-gob-info">{message}</div> : null}
      {error ? <div className="card text-gob-error">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Eventos" value={resumen?.total ?? "—"} />
        <KpiCard label="Aperturas" value={resumen?.aperturas ?? "—"} />
        <KpiCard label="Intentos no registrados" value={resumen?.denegados ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <p className="mb-4 font-medium text-content">Tipo de evento</p>
          <Donut centerLabel="Eventos" data={tipoEvento(resumen?.por_evento || [])} />
        </div>
        <div className="card">
          <p className="mb-4 font-medium text-content">Eventos por hora</p>
          <BarChart data={serieHoras(resumen?.por_hora || [])} color="#7c3aed" />
        </div>
      </div>

      {/* ---- Usuarios registrados ---- */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-content">Usuarios registrados</p>
            <p className="text-xs text-content-muted">
              {usuarios.length} usuarios con accesos · clic para ver su histórico
            </p>
          </div>
          {usuarioSel ? (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                setUsuarioSel(null);
                setUsuarioHist(null);
              }}
            >
              Cerrar histórico
            </button>
          ) : null}
        </div>

        {usuarios.length === 0 ? (
          <p className="text-sm text-content-muted">Sin accesos de usuarios registrados.</p>
        ) : (
          <div className="max-h-[340px] overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>ID</th>
                  <th className="text-right">Accesos</th>
                  <th className="w-40">Frecuencia</th>
                  <th>Último</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr
                    key={u.pin}
                    className={`cursor-pointer transition hover:bg-surface-soft ${
                      usuarioSel === u.pin ? "bg-surface-soft" : ""
                    }`}
                    onClick={() => verHistorial(u.pin)}
                  >
                    <td className="font-medium">{u.nombre}</td>
                    <td className="font-mono text-xs">{u.pin}</td>
                    <td className="text-right tabular-nums">{u.total}</td>
                    <td>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                        <div
                          className="h-full rounded-full bg-gob-blue"
                          style={{ width: `${Math.max((u.total / maxUsuario) * 100, 4)}%` }}
                        />
                      </div>
                    </td>
                    <td className="text-xs text-content-muted">{formatRelative(u.ultima)}</td>
                    <td>
                      <span className="text-xs text-gob-info">
                        {usuarioSel === u.pin ? "Ocultar" : "Historial"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {usuarioSel && usuarioHist ? (
          <div className="mt-4 rounded-xl border border-surface-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm">
                <Badge tone="success">{usuarioHist.nombre}</Badge>
                <span className="text-content-muted">
                  {usuarioHist.total} accesos · ID {usuarioHist.pin}
                </span>
              </span>
            </div>
            <div className="px-4 py-3">
              <div className="max-h-[320px] overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Evento</th>
                      <th>Dispositivo</th>
                      <th>Área</th>
                      <th>Lector</th>
                      <th>Modo</th>
                      <th>Tarjeta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarioHist.registros.map((r, i) => (
                      <tr key={i}>
                        <td>{formatDateTime(r.fecha)}</td>
                        <td>
                          <Badge tone={tonoEvento(r.evento)}>{r.evento || "evento"}</Badge>
                        </td>
                        <td>{r.dispositivo || "—"}</td>
                        <td>{r.area || "—"}</td>
                        <td>{r.lector || "—"}</td>
                        <td>{r.modo || "—"}</td>
                        <td className="font-mono">{r.tarjeta || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- Usuarios no registrados ---- */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-content">Usuarios no registrados</p>
            <p className="text-xs text-content-muted">
              {noReg?.total ?? 0} intentos · {noReg?.grupos.length ?? 0} identidades
            </p>
          </div>
          {expandido ? (
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                setExpandido(null);
                setFiltroTarjeta("");
                setFiltroPin("");
              }}
            >
              Cerrar detalle
            </button>
          ) : null}
        </div>

        {(noReg?.grupos || []).length === 0 ? (
          <p className="text-sm text-content-muted">
            Sin intentos de usuarios no registrados en el período.
          </p>
        ) : (
          <>
            <div className="grid max-h-[380px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {noReg!.grupos.map((g) => {
                const activo = expandido === g.clave;
                const tone =
                  g.id_tipo === "tarjeta"
                    ? "bg-gob-warning"
                    : g.id_tipo === "pin"
                    ? "bg-gob-info"
                    : "bg-gob-error";
                const pct = Math.max((g.total / maxNoReg) * 100, 4);
                const etiqueta =
                  g.id_tipo === "tarjeta"
                    ? g.tarjeta
                    : g.id_tipo === "pin"
                    ? `PIN ${g.pin}`
                    : "Huella";
                return (
                  <button
                    key={g.clave}
                    type="button"
                    onClick={() => seleccionarNoReg(g)}
                    className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition ${
                      activo
                        ? "border-gob-info bg-surface-soft"
                        : "border-surface-border hover:border-gob-info hover:bg-surface-soft"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
                        <span
                          className="truncate font-mono text-sm font-semibold text-content"
                          title={etiqueta || ""}
                        >
                          {etiqueta}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-xs font-medium tabular-nums text-content">
                        {g.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-content-muted">
                      <span className="truncate">
                        {g.id_tipo === "tarjeta" ? "Tarjeta" : g.id_tipo === "pin" ? "PIN" : "Sin registrar"}
                      </span>
                      <span className="shrink-0">{formatRelative(g.ultima)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {expandido
              ? (() => {
                  const g = noReg!.grupos.find((x) => x.clave === expandido);
                  if (!g) return null;
                  return (
                    <div className="mt-4 rounded-xl border border-surface-border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge
                            tone={
                              g.id_tipo === "tarjeta"
                                ? "warning"
                                : g.id_tipo === "pin"
                                ? "info"
                                : "error"
                            }
                          >
                            {g.id_tipo === "tarjeta"
                              ? `Tarjeta ${g.tarjeta}`
                              : g.id_tipo === "pin"
                              ? `PIN ${g.pin}`
                              : "Huella sin registrar"}
                          </Badge>
                          <span className="text-content-muted">{g.total} intentos</span>
                          {g.id ? (
                            <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-content-muted">
                              ID: <span className="font-mono text-content">{g.id}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-content-muted">Sin ID</span>
                          )}
                        </span>
                        <span className="text-xs text-content-muted">
                          {formatDateTime(g.primera)} → {formatDateTime(g.ultima)}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {g.dispositivos.map((d) => (
                            <span
                              key={d}
                              className="rounded-full bg-surface-soft px-2 py-0.5 text-[11px] text-content-muted"
                            >
                              {d}
                            </span>
                          ))}
                          {g.modos.map((m) => (
                            <span
                              key={m}
                              className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] text-content-muted"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                        <div className="max-h-[320px] overflow-auto">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Tarjeta</th>
                                <th>PIN</th>
                                <th>Dispositivo</th>
                                <th>Área</th>
                                <th>Lector</th>
                                <th>Modo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.registros.map((r, i) => (
                                <tr key={i}>
                                  <td>{formatDateTime(r.fecha)}</td>
                                  <td className="font-mono">{r.tarjeta || "—"}</td>
                                  <td className="font-mono">{r.pin || "—"}</td>
                                  <td>{r.dispositivo || "—"}</td>
                                  <td>{r.area || "—"}</td>
                                  <td>{r.lector || "—"}</td>
                                  <td>{r.modo || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()
              : null}
          </>
        )}
      </section>

      <div className="card">
        <p className="mb-4 font-medium text-content">Eventos por dispositivo</p>
        <BarList colorful items={resumen?.por_dispositivo || []} />
      </div>

      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Dispositivo</label>
          <input
            className="input"
            value={dispositivo}
            onChange={(e) => setDispositivo(e.target.value)}
            placeholder="Piso 8"
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Área</label>
          <input className="input" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Evento</label>
          <input
            className="input"
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            placeholder="Apertura"
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="mb-1 block text-sm text-content-muted">Usuario</label>
          <input className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit">
          Filtrar
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {filtroTarjeta || filtroPin ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-content-muted">Mostrando registros de:</span>
            <Badge tone={filtroPin ? "info" : "warning"}>
              {filtroPin ? `PIN ${filtroPin}` : `Tarjeta ${filtroTarjeta}`}
            </Badge>
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                setFiltroTarjeta("");
                setFiltroPin("");
              }}
            >
              Quitar filtro
            </button>
          </div>
        ) : (
          <span className="text-xs text-content-muted">
            Mostrando eventos de acceso (sin intentos no registrados)
          </span>
        )}
        <label className="flex items-center gap-2 text-xs text-content-muted">
          <input
            type="checkbox"
            checked={incluirNoReg}
            onChange={(e) => setIncluirNoReg(e.target.checked)}
          />
          Incluir intentos de usuarios no registrados
        </label>
      </div>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Dispositivo</th>
              <th>Área</th>
              <th>Evento</th>
              <th>Usuario</th>
              <th>Tarjeta</th>
              <th>Modo</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.fecha)}</td>
                <td>{r.dispositivo || "—"}</td>
                <td>{r.area || "—"}</td>
                <td>
                  <Badge tone={tonoEvento(r.evento)}>{r.evento || "evento"}</Badge>
                </td>
                <td>{r.usuario}</td>
                <td className="tabular-nums">{r.tarjeta || "—"}</td>
                <td>{r.modo || "—"}</td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-content-muted">
                  Sin registros en el período. Pulsa «Sincronizar».
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
