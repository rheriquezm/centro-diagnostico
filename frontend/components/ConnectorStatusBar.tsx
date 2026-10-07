import { formatRelative } from "@/lib/format";
import type { ConnectorInfo, SchedulerInfo } from "@/lib/useConnections";

type State = "ok" | "running" | "error" | "off" | "idle";

const DOT: Record<State, string> = {
  ok: "bg-gob-success",
  running: "bg-gob-info animate-pulse",
  error: "bg-gob-error",
  off: "bg-content-muted/40",
  idle: "bg-content-muted/40",
};

const LABEL: Record<State, string> = {
  ok: "Conectado",
  running: "Sincronizando…",
  error: "Error de conexión",
  off: "Sin configurar",
  idle: "Sin datos",
};

export default function ConnectorStatusBar({
  info,
  scheduler,
  busy = false,
}: {
  info?: ConnectorInfo | null;
  scheduler?: SchedulerInfo | null;
  busy?: boolean;
}) {
  const run = info?.last_run;
  const running = busy || run?.status === "running";
  const state: State = !info
    ? "idle"
    : !info.configured
    ? "off"
    : running
    ? "running"
    : run?.status === "error"
    ? "error"
    : "ok";

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[state]}`} />
        <span className="font-medium text-content">{LABEL[state]}</span>

        {state === "running" ? (
          <span className="text-content-muted">· procesando en segundo plano…</span>
        ) : null}

        {state === "ok" ? (
          <span className="text-content-muted">
            · última sync {formatRelative(run?.finished_at)} ·{" "}
            {run?.items ?? 0} registros
          </span>
        ) : null}

        {state === "error" ? (
          <span
            className="max-w-[560px] truncate text-gob-error"
            title={run?.error || ""}
          >
            · {run?.error || "revisa la configuración"}
          </span>
        ) : null}

        {state === "off" ? (
          <span className="text-content-muted">
            · faltan credenciales en la configuración
          </span>
        ) : null}
      </div>

      {scheduler?.enabled ? (
        <div className="shrink-0 text-xs text-content-muted">
          Siguiente automática: {formatRelative(scheduler.next_run_at)}
        </div>
      ) : null}
    </div>
  );
}
