"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

export type SyncRunInfo = {
  status: string | null;
  items: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

export type ConnectorInfo = {
  label: string;
  configured: boolean;
  detail?: string;
  last_run: SyncRunInfo | null;
};

export type SchedulerInfo = {
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
};

export type Connections = {
  scheduler: SchedulerInfo;
  connectors: Record<string, ConnectorInfo>;
  ai: { provider: string; configured: boolean };
};

export function useConnections() {
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get<Connections>("/api/system/connections");
      setData(d);
      setError(null);
      return d;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const waitFor = useCallback(
    async (connector: string, baseline: string | null, timeoutMs = 180000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const d = await refresh();
        const run = d?.connectors?.[connector]?.last_run;
        if (run && run.started_at !== baseline && run.status !== "running") {
          return run;
        }
      }
      return null;
    },
    [refresh],
  );

  const runSync = useCallback(
    async (connector: string, post: () => Promise<unknown>) => {
      const before = await refresh();
      const baseline =
        before?.connectors?.[connector]?.last_run?.started_at ?? null;
      await post();
      return waitFor(connector, baseline);
    },
    [refresh, waitFor],
  );

  return { data, error, refresh, waitFor, runSync };
}
