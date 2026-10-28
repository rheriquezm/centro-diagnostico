export function nowIso() {
  return new Date().toISOString();
}

export function cmpVersion(a, b) {
  const pa = String(a ?? "0").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b ?? "0").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function majorMinor(version) {
  const parts = String(version ?? "").split(".");
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  return `${major}.${minor}`;
}

export function severityRank(severity) {
  const s = String(severity ?? "").toUpperCase();
  if (s.startsWith("CRIT")) return 4;
  if (s.startsWith("HIGH") || s === "ALTA") return 3.5;
  if (s.startsWith("MED") || s === "MEDIA") return 2.5;
  if (s.startsWith("LOW") || s === "BAJA") return 1.5;
  return 2;
}

export function severityFromCvss(cvss) {
  if (cvss === null || cvss === undefined) return "UNKNOWN";
  if (cvss >= 9) return "CRITICAL";
  if (cvss >= 7) return "HIGH";
  if (cvss >= 4) return "MEDIUM";
  return "LOW";
}

export function levelFromPriority(priority) {
  if (priority >= 15) return "Actuar ya";
  if (priority >= 11) return "Alta";
  if (priority >= 7) return "Media";
  if (priority >= 4.5) return "Puede esperar";
  return "Informativa";
}

export function stripHtml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function isEol(value) {
  if (value === true) return true;
  if (!value || typeof value !== "string") return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
