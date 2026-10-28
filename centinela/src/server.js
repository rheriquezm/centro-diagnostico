import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureDirs,
  loadConfig,
  loadState,
  saveConfig,
  saveState,
} from "./store.js";
import { runSync, seedState } from "./engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4310);
const AUTH_USER = process.env.AUTH_USER || "";
const AUTH_PASS = process.env.AUTH_PASS || "";
const STARTED_AT = Date.now();

let syncing = false;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

ensureDirs();
if (!loadState()) saveState(seedState());

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function redactConfig(config) {
  return {
    inventory: config.inventory,
    watch: config.watch,
    feeds: config.feeds,
    settings: {
      ...config.settings,
      webhookUrl: config.settings?.webhookUrl ? "********" : "",
    },
  };
}

function currentState() {
  const state = loadState() || seedState();
  return { ...state, config: redactConfig(loadConfig()) };
}

function authorized(req) {
  if (!AUTH_USER || !AUTH_PASS) return true;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);
  return user === AUTH_USER && pass === AUTH_PASS;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function serveStatic(pathname, res) {
  let relative = pathname;
  if (relative === "/") relative = "/index.html";
  const file = path.resolve(PUBLIC_DIR, `.${relative}`);
  if (!file.startsWith(PUBLIC_DIR)) {
    json(res, 404, { detail: "No encontrado" });
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      json(res, 404, { detail: "No encontrado" });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  });
}

function applyFindingAction(state, id, action, value) {
  const findings = state.findings || [];
  const index = findings.findIndex((finding) => finding.id === id);
  if (index === -1) return null;

  const meta = { ...(state.meta || {}) };
  const entry = { ...(meta[id] || {}) };
  const finding = { ...findings[index] };

  if (action === "ack") {
    entry.ack = true;
    finding.ack = true;
  } else if (action === "unack") {
    entry.ack = false;
    finding.ack = false;
  } else if (action === "dismiss") {
    entry.dismissed = true;
    findings.splice(index, 1);
  } else if (action === "snooze") {
    entry.snoozedUntil =
      value || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    finding.snoozedUntil = entry.snoozedUntil;
  } else if (action === "note") {
    entry.note = String(value || "");
    finding.note = entry.note;
  } else {
    return null;
  }

  meta[id] = entry;
  const next = { ...state, findings, meta };
  saveState(next);
  return finding;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*"
  );
  res.setHeader("Referrer-Policy", "no-referrer");

  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`
    );
    const pathname = url.pathname;

    if (pathname === "/api/health") {
      const state = loadState();
      json(res, 200, {
        ok: true,
        uptime: Math.floor((Date.now() - STARTED_AT) / 1000),
        lastSyncAt: state?.lastSyncAt || null,
        version: "1.0.0",
      });
      return;
    }

    if (pathname.startsWith("/api/") && !authorized(req)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Centinela"');
      json(res, 401, { detail: "No autorizado" });
      return;
    }

    if (pathname === "/api/state" && req.method === "GET") {
      json(res, 200, currentState());
      return;
    }

    if (pathname === "/api/config" && req.method === "GET") {
      json(res, 200, redactConfig(loadConfig()));
      return;
    }

    if (pathname === "/api/config" && req.method === "PUT") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const current = loadConfig();
      const next = {
        inventory: Array.isArray(body.inventory)
          ? body.inventory
          : current.inventory,
        watch: Array.isArray(body.watch) ? body.watch : current.watch,
        feeds: Array.isArray(body.feeds) ? body.feeds : current.feeds,
        settings: { ...current.settings, ...(body.settings || {}) },
      };
      if (next.settings.webhookUrl === "********") {
        next.settings.webhookUrl = current.settings.webhookUrl;
      }
      saveConfig(next);
      json(res, 200, redactConfig(next));
      return;
    }

    if (pathname === "/api/sync" && req.method === "POST") {
      if (syncing) {
        json(res, 202, { started: false, message: "Sincronizacion en curso" });
        return;
      }
      syncing = true;
      runSync()
        .catch((error) => console.error("sync:", error.message))
        .finally(() => {
          syncing = false;
        });
      json(res, 202, { started: true });
      return;
    }

    if (pathname === "/api/export.csv") {
      const state = currentState();
      const header = [
        "id",
        "software",
        "installedVersion",
        "availableVersion",
        "cve",
        "cvss",
        "priority",
        "level",
        "impact",
        "kev",
        "title",
        "url",
      ];
      const lines = [header.join(",")];
      for (const finding of state.findings || []) {
        lines.push(
          header.map((key) => csvEscape(finding[key])).join(",")
        );
      }
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="centinela.csv"',
      });
      res.end(lines.join("\n"));
      return;
    }

    if (pathname === "/api/github/status") {
      json(res, 200, { configured: false, limit: null, remaining: null });
      return;
    }

    const findingMatch = pathname.match(/^\/api\/findings\/([^/]+)$/);
    if (findingMatch) {
      const id = decodeURIComponent(findingMatch[1]);
      const state = loadState() || seedState();
      const finding = (state.findings || []).find((item) => item.id === id);
      if (!finding) {
        json(res, 404, { detail: "Hallazgo no encontrado" });
        return;
      }
      if (req.method === "GET") {
        json(res, 200, finding);
        return;
      }
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const updated = applyFindingAction(
          state,
          id,
          body.action,
          body.value
        );
        if (!updated) {
          json(res, 400, { detail: "Accion no valida" });
          return;
        }
        json(res, 200, updated);
        return;
      }
      if (req.method === "DELETE") {
        const next = {
          ...state,
          findings: (state.findings || []).filter((item) => item.id !== id),
        };
        saveState(next);
        json(res, 200, { ok: true });
        return;
      }
    }

    if (pathname.startsWith("/api/")) {
      json(res, 404, { detail: "No encontrado" });
      return;
    }

    serveStatic(pathname, res);
  } catch (error) {
    console.error("request:", error);
    json(res, 500, { detail: "Error interno" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Centinela escuchando en http://${HOST}:${PORT}`);
  const settings = loadConfig().settings;
  const state = loadState();
  const last = state?.lastSyncAt ? new Date(state.lastSyncAt).getTime() : 0;
  const localOnly = state?.sync?.status === "local";
  const stale =
    localOnly ||
    !last ||
    Date.now() - last > (Number(settings.refreshMinutes) || 60) * 60000;

  if (stale) {
    setTimeout(() => {
      if (syncing) return;
      syncing = true;
      runSync()
        .catch((error) => console.error("sync:", error.message))
        .finally(() => {
          syncing = false;
        });
    }, 1500);
  }

  const minutes = Math.max(5, Number(settings.refreshMinutes) || 60);
  setInterval(() => {
    if (syncing) return;
    syncing = true;
    runSync()
      .catch((error) => console.error("sync:", error.message))
      .finally(() => {
        syncing = false;
      });
  }, minutes * 60000);
});
