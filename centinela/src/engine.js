import { SEED_ADVISORIES } from "./defaults.js";
import { loadConfig, loadState, saveState } from "./store.js";
import { machineInfo } from "./machine.js";
import {
  eolFor,
  epssFor,
  kevCatalog,
  osvAdvisories,
  rssAdvisories,
} from "./sources.js";
import {
  cmpVersion,
  isEol,
  levelFromPriority,
  majorMinor,
  nowIso,
  severityFromCvss,
  severityRank,
} from "./lib/util.js";

function findInventory(config, name) {
  const target = String(name || "").toLowerCase();
  return (config.inventory || []).find(
    (item) => String(item.name || "").toLowerCase() === target
  );
}

function priorityFor({ cvss, severity, impact, kev, epss, criticality }) {
  const base = cvss ?? severityRank(severity) * 2.2;
  const factor =
    impact === "confirmed"
      ? 1.5
      : impact === "likely"
      ? 1.25
      : impact === "possible"
      ? 1.1
      : 1;
  const crit = Number(criticality ?? 3);
  let priority =
    base * (kev ? 1.6 : 1) * factor * (1 + (crit - 3) * 0.08) +
    (epss || 0) * 4;
  if (impact === "watch" || impact === "context") priority = Math.min(priority, 2);
  return Number(priority.toFixed(2));
}

function buildFinding(advisory, inventory) {
  const inv = inventory || null;
  const impact = advisory.impact || "confirmed";
  const cvss = advisory.cvss ?? null;
  const severity = advisory.severity || severityFromCvss(cvss);
  const criticality = Number(inv?.criticality ?? 3);
  const priority = priorityFor({
    cvss,
    severity,
    impact,
    kev: advisory.kev,
    epss: advisory.epss,
    criticality,
  });
  return {
    id: `${advisory.cve || advisory.title || "hallazgo"}-${
      inv?.name || advisory.software || ""
    }`
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .slice(0, 140),
    software: inv?.name || advisory.software || "—",
    installedVersion: inv?.version || advisory.installed || "",
    availableVersion: advisory.fixed || "",
    cve: advisory.cve || "",
    cvss,
    epss: advisory.epss ?? null,
    priority,
    level: levelFromPriority(priority),
    impact,
    kev: !!advisory.kev,
    severity,
    title: advisory.title || "",
    url: advisory.url || "",
    published: advisory.published || "",
    criticality,
  };
}

function seedAdvisories(config) {
  const output = [];
  for (const seed of SEED_ADVISORIES) {
    const inv = findInventory(config, seed.software);
    if (!inv) continue;
    if (seed.affected?.before) {
      if (cmpVersion(inv.version, seed.affected.before) < 0) {
        output.push({ ...seed, impact: "confirmed", fixed: seed.affected.before });
      }
      continue;
    }
    if (seed.affected?.eol && majorMinor(inv.version) === seed.affected.eol) {
      output.push({ ...seed, impact: "confirmed" });
    }
  }
  return output;
}

function seedUpdates(config) {
  const map = new Map();
  for (const seed of SEED_ADVISORIES) {
    if (!seed.affected?.before) continue;
    const inv = findInventory(config, seed.software);
    if (!inv) continue;
    if (cmpVersion(inv.version, seed.affected.before) >= 0) continue;
    map.set(inv.name, {
      id: `upd-${inv.name}`,
      software: inv.name,
      installedVersion: inv.version,
      availableVersion: seed.affected.before,
      criticality: inv.criticality,
      eol: "",
      note: "Actualizacion de seguridad",
    });
  }
  return [...map.values()];
}

function dedupeFindings(findings) {
  const map = new Map();
  for (const finding of findings) {
    const isEol =
      !finding.cve &&
      /sin soporte|fin de soporte|\beol\b/i.test(finding.title || "");
    const key = `${finding.software}|${
      isEol ? "eol" : finding.cve || finding.title
    }`;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, finding);
      continue;
    }
    const better =
      (finding.priority || 0) > (previous.priority || 0) ? finding : previous;
    map.set(key, {
      ...better,
      kev: previous.kev || finding.kev,
      epss: Math.max(previous.epss || 0, finding.epss || 0) || null,
      availableVersion:
        previous.availableVersion || finding.availableVersion,
      impact: better.impact,
    });
  }
  return [...map.values()];
}

function dedupeUpdates(updates) {
  const map = new Map();
  for (const update of updates) {
    const previous = map.get(update.software);
    if (!previous) {
      map.set(update.software, update);
      continue;
    }
    if (
      cmpVersion(update.availableVersion, previous.availableVersion) > 0
    ) {
      map.set(update.software, update);
    }
  }
  return [...map.values()];
}

function recompute(finding) {
  const priority = priorityFor({
    cvss: finding.cvss,
    severity: finding.severity,
    impact: finding.impact,
    kev: finding.kev,
    epss: finding.epss,
    criticality: finding.criticality,
  });
  return {
    ...finding,
    priority,
    level: levelFromPriority(priority),
  };
}

function computeStats(findings, updates, inventory) {
  return {
    total: findings.length,
    afectan: findings.filter((f) =>
      ["affected", "confirmed"].includes(f.impact)
    ).length,
    urgentes: findings.filter((f) => ["Actuar ya", "Alta"].includes(f.level))
      .length,
    kev: findings.filter((f) => f.kev).length,
    actualizaciones: updates.length,
    inventario: (inventory || []).length,
  };
}

function finalize({ findings, updates, config, startedAt, sources, status, meta }) {
  const machine = machineInfo();
  const actions = meta || {};
  const dismissed = new Set(
    Object.entries(actions)
      .filter(([, value]) => value && value.dismissed)
      .map(([key]) => key)
  );
  const clean = dedupeFindings(findings)
    .map(recompute)
    .filter((f) => f.impact && f.impact !== "none" && !dismissed.has(f.id))
    .map((f) => {
      const action = actions[f.id] || {};
      return {
        ...f,
        ...(action.ack ? { ack: true } : {}),
        ...(action.note ? { note: action.note } : {}),
        ...(action.snoozedUntil ? { snoozedUntil: action.snoozedUntil } : {}),
      };
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const pendingUpdates = dedupeUpdates(updates).sort((a, b) =>
    String(a.software).localeCompare(String(b.software))
  );

  const inventory = (config.inventory || []).map((item) => ({
    name: item.name,
    version: item.version,
    criticality: item.criticality,
    environment: item.environment,
    host: item.host || machine.hostname,
    ip: item.ip || machine.ip,
    os: item.os || machine.os,
    role: item.role || "",
    port: item.port ?? null,
    eol: item.eol || "",
  }));

  const bySoftware = new Map(
    inventory.map((item) => [String(item.name).toLowerCase(), item])
  );
  const hostMap = new Map();
  for (const item of inventory) {
    const key = `${item.host}|${item.ip}`;
    if (!hostMap.has(key)) {
      hostMap.set(key, {
        host: item.host,
        ip: item.ip,
        os: item.os,
        environment: item.environment,
        services: [],
        findings: 0,
        urgentes: 0,
        updates: 0,
      });
    }
    hostMap.get(key).services.push(item.name);
  }
  for (const finding of clean) {
    const item = bySoftware.get(String(finding.software).toLowerCase());
    if (!item) continue;
    const host = hostMap.get(`${item.host}|${item.ip}`);
    if (!host) continue;
    host.findings += 1;
    if (["Actuar ya", "Alta"].includes(finding.level)) host.urgentes += 1;
  }
  for (const update of pendingUpdates) {
    const item = bySoftware.get(String(update.software).toLowerCase());
    if (!item) continue;
    const host = hostMap.get(`${item.host}|${item.ip}`);
    if (!host) continue;
    host.updates += 1;
  }
  const hosts = [...hostMap.values()];

  return {
    generatedAt: nowIso(),
    lastSyncAt: nowIso(),
    sync: {
      status: status || "completed",
      startedAt,
      finishedAt: nowIso(),
      sources,
    },
    stats: computeStats(clean, pendingUpdates, inventory),
    findings: clean,
    updates: pendingUpdates,
    inventory,
    hosts,
    inventory_mode: "declarado",
    machine,
    watch: config.watch || [],
    meta: actions,
    config: {
      inventory: config.inventory,
      watch: config.watch,
      feeds: config.feeds,
      settings: config.settings,
    },
  };
}

export function seedState() {
  const config = loadConfig();
  const findings = seedAdvisories(config).map((advisory) =>
    buildFinding(advisory, findInventory(config, advisory.software))
  );
  return finalize({
    findings,
    updates: seedUpdates(config),
    config,
    startedAt: nowIso(),
    sources: { seeds: "ok" },
    status: "local",
    meta: {},
  });
}

export async function runSync(options = {}) {
  const config = loadConfig();
  const previous = loadState();
  const meta = previous?.meta || {};
  const startedAt = nowIso();
  const sources = { seeds: "ok" };

  let findings = seedAdvisories(config).map((advisory) =>
    buildFinding(advisory, findInventory(config, advisory.software))
  );
  let updates = seedUpdates(config);

  let state = finalize({
    findings,
    updates,
    config,
    startedAt,
    sources,
    status: "running",
    meta,
  });
  saveState(state);
  options.onPartial?.(state);

  try {
    const targets = (config.inventory || []).filter((inv) => inv.eolProduct);
    const settled = await Promise.allSettled(
      targets.map(async (inv) => ({
        inv,
        cycles: await eolFor(inv.eolProduct),
      }))
    );
    settled.forEach((result, index) => {
      const inv = targets[index];
      if (result.status === "rejected") {
        sources[`eol:${inv.eolProduct}`] = "error";
        return;
      }
      const cycle = result.value.cycles.find(
        (item) => String(item.cycle) === majorMinor(inv.version)
      );
      if (!cycle) {
        sources[`eol:${inv.eolProduct}`] = "sin ciclo";
        return;
      }
      sources[`eol:${inv.eolProduct}`] = "ok";
      if (cycle.latest && cmpVersion(cycle.latest, inv.version) > 0) {
        updates.push({
          id: `upd-${inv.name}`,
          software: inv.name,
          installedVersion: inv.version,
          availableVersion: cycle.latest,
          criticality: inv.criticality,
          eol: typeof cycle.eol === "string" ? cycle.eol : "",
          note: "Nueva version disponible",
        });
      }
      if (isEol(cycle.eol)) {
        findings.push(
          buildFinding(
            {
              software: inv.name,
              cve: "",
              cvss: 7.5,
              severity: "HIGH",
              title: `${inv.name} ${inv.version} sin soporte (EOL)`,
              url: `https://endoflife.date/${inv.eolProduct}`,
              impact: "confirmed",
            },
            inv
          )
        );
      }
    });
    state = finalize({
      findings,
      updates,
      config,
      startedAt,
      sources,
      status: "running",
      meta,
    });
    saveState(state);
    options.onPartial?.(state);
  } catch {
    sources.eol = "error";
  }

  try {
    const advisories = await osvAdvisories(config.inventory);
    findings.push(
      ...advisories.map((advisory) =>
        buildFinding(advisory, findInventory(config, advisory.software))
      )
    );
    sources.osv = "ok";
  } catch {
    sources.osv = "error";
  }

  try {
    const catalog = await kevCatalog();
    findings.forEach((finding) => {
      if (finding.cve && catalog.has(finding.cve)) finding.kev = true;
    });
    sources.kev = "ok";
  } catch {
    sources.kev = "error";
  }

  try {
    const epss = await epssFor(findings.map((finding) => finding.cve));
    if (epss.size) {
      findings.forEach((finding) => {
        if (finding.cve && epss.has(finding.cve)) {
          finding.epss = epss.get(finding.cve);
        }
      });
    }
    sources.epss = "ok";
  } catch {
    sources.epss = "error";
  }

  try {
    const advisories = await rssAdvisories(config);
    findings.push(
      ...advisories.map((advisory) =>
        buildFinding(advisory, findInventory(config, advisory.software))
      )
    );
    sources.rss = "ok";
  } catch {
    sources.rss = "error";
  }

  state = finalize({
    findings,
    updates,
    config,
    startedAt,
    sources,
    status: "completed",
    meta,
  });
  saveState(state);
  return state;
}
