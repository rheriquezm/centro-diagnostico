import { getJson, postJson, request } from "./lib/http.js";
import { parseFeed } from "./lib/feed.js";
import { severityRank } from "./lib/util.js";

export async function eolFor(product) {
  const data = await getJson(
    `https://endoflife.date/api/${encodeURIComponent(product)}.json`,
    { timeout: 12000, retries: 1 }
  );
  return Array.isArray(data) ? data : [];
}

export async function kevCatalog() {
  const data = await getJson(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { timeout: 20000, retries: 1 }
  );
  const catalog = new Set();
  for (const item of data.vulnerabilities || []) {
    if (item.cveID) catalog.add(item.cveID);
  }
  return catalog;
}

export async function epssFor(cves) {
  const result = new Map();
  const unique = [...new Set((cves || []).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const url = `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(
      chunk.join(",")
    )}`;
    const data = await getJson(url, { timeout: 12000, retries: 1 });
    for (const row of data.data || []) {
      result.set(row.cve, Number(row.epss) || 0);
    }
  }
  return result;
}

function cvssFromSeverity(severity) {
  const s = String(severity || "").toUpperCase();
  if (s.startsWith("CRIT")) return 9.5;
  if (s.startsWith("HIGH")) return 8;
  if (s.startsWith("MED")) return 5.5;
  if (s.startsWith("LOW")) return 3;
  return 6;
}

export async function osvAdvisories(inventory) {
  const queries = [];
  const refs = [];
  for (const item of inventory || []) {
    for (const pkg of item.packages || []) {
      if (!pkg || !pkg.name || !pkg.ecosystem) continue;
      queries.push({
        package: { name: pkg.name, ecosystem: pkg.ecosystem },
        version: item.version,
      });
      refs.push(item);
    }
  }
  if (!queries.length) return [];

  const data = await postJson(
    "https://api.osv.dev/v1/querybatch",
    { queries },
    { timeout: 20000, retries: 1 }
  );
  const results = data.results || [];
  const advisories = [];

  results.forEach((result, index) => {
    const inv = refs[index];
    for (const vuln of result.vulns || []) {
      const aliases = [vuln.id, ...(vuln.aliases || [])].filter(Boolean);
      const cve =
        aliases.find((alias) => String(alias).startsWith("CVE-")) || vuln.id;
      const severity = String(
        (vuln.database_specific && vuln.database_specific.severity) || "MEDIUM"
      ).toUpperCase();
      advisories.push({
        software: inv.name,
        cve,
        cvss: cvssFromSeverity(severity),
        severity,
        title: vuln.summary || vuln.details || `Vulnerabilidad en ${inv.name}`,
        url: `https://osv.dev/vulnerability/${vuln.id}`,
        installed: inv.version,
        impact: "confirmed",
      });
    }
  });

  return advisories;
}

const SECURITY_WORDS =
  /security|seguridad|vulnerab|cve-\d{4}-\d{4,}|rce|remote code|ejecuci[oó]n remota|xss|sql injection|csrf|injection|escalation/i;

export async function rssAdvisories(config) {
  const advisories = [];
  for (const feed of config.feeds || []) {
    try {
      const response = await request(feed.url, {
        timeout: 12000,
        retries: 1,
        headers: { Accept: "application/rss+xml, application/atom+xml, text/xml" },
      });
      if (!response.ok) continue;
      const items = parseFeed(response.text, 30);
      for (const item of items) {
        const text = `${item.title} ${item.description}`;
        if (!SECURITY_WORDS.test(text)) continue;
        for (const inv of config.inventory || []) {
          const names = [inv.name, ...(inv.keywords || [])]
            .map((name) => String(name || "").toLowerCase())
            .filter(Boolean);
          if (!names.some((name) => text.toLowerCase().includes(name))) continue;
          const cveMatch = item.title.match(/CVE-\d{4}-\d{4,}/i);
          const critical = /rce|remote code|ejecuci[oó]n remota|critical|cr[ií]tic/i.test(
            text
          );
          advisories.push({
            software: inv.name,
            cve: cveMatch ? cveMatch[0].toUpperCase() : "",
            cvss: critical ? 9 : 6,
            severity: critical ? "CRITICAL" : "MEDIUM",
            title: item.title || `${feed.name}: aviso de seguridad`,
            url: item.link || feed.url,
            installed: inv.version,
            impact: "likely",
            published: item.date,
          });
          break;
        }
      }
    } catch {
      // Fuente no disponible: se omite sin romper la sincronizacion.
    }
  }
  return advisories;
}

export { severityRank };
