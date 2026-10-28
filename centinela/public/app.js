const params = new URLSearchParams(window.location.search);
if (params.get("embed") === "1") {
  document.body.classList.add("embed");
}
const themeParam = params.get("theme");
if (themeParam === "dark" || themeParam === "light") {
  document.documentElement.dataset.theme = themeParam;
}

const state = { data: null };

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toneFor(level) {
  if (level === "Actuar ya") return "error";
  if (level === "Alta") return "warning";
  if (level === "Media") return "info";
  if (level === "Puede esperar") return "success";
  return "neutral";
}

function criticidadTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "neutral";
  if (n >= 5) return "error";
  if (n >= 4) return "warning";
  return "success";
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-CL");
}

function renderKpis(data) {
  const stats = data.stats || {};
  const items = [
    ["Hallazgos", stats.total, "--accent"],
    ["Te afecta", stats.afectan, "--error"],
    ["Urgentes", stats.urgentes, "--warn"],
    ["Explotadas (KEV)", stats.kev, "--error"],
    ["Actualizaciones", stats.actualizaciones, "--ok"],
  ];
  document.getElementById("kpis").innerHTML = items
    .map(
      ([label, value, color]) => `
      <div class="kpi">
        <div class="n" style="color: var(${color})">${esc(value ?? 0)}</div>
        <div class="l">${esc(label)}</div>
      </div>`
    )
    .join("");
}

function renderPrioridad(data) {
  const findings = data.findings || [];
  const urgent = findings.filter((f) =>
    ["Actuar ya", "Alta"].includes(f.level)
  );
  const list = (urgent.length ? urgent : findings).slice(0, 12);
  document.getElementById("prioridad-nota").textContent = urgent.length
    ? `${urgent.length} para revisar ahora`
    : "Sin urgencias";

  const target = document.getElementById("prioridad");
  if (!list.length) {
    target.innerHTML = '<p class="empty">Sin hallazgos registrados.</p>';
    return;
  }

  target.innerHTML = list
    .map((f) => {
      const versions = [
        f.installedVersion ? `Instalada: ${esc(f.installedVersion)}` : "",
        f.availableVersion
          ? `Actualizar a: <strong>${esc(f.availableVersion)}</strong>`
          : "",
        f.cve ? `<span class="mono">${esc(f.cve)}</span>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `
        <div class="item">
          <div class="item-head">
            <span class="badge ${toneFor(f.level)}">${esc(f.level)}</span>
            ${f.kev ? '<span class="badge error">KEV</span>' : ""}
            ${
              f.cvss !== null && f.cvss !== undefined
                ? `<span class="muted small">CVSS ${esc(Number(f.cvss).toFixed(1))}</span>`
                : ""
            }
            ${f.impact ? `<span class="muted small">${esc(f.impact)}</span>` : ""}
            ${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noreferrer">Ver aviso</a>` : ""}
          </div>
          <h3>${esc(f.software)}</h3>
          <p>${esc(f.title)}</p>
          <div class="meta">${versions}</div>
        </div>`;
    })
    .join("");
}

function renderUpdates(data) {
  const updates = data.updates || [];
  const target = document.getElementById("updates");
  if (!updates.length) {
    target.innerHTML = '<p class="empty">Sin actualizaciones pendientes.</p>';
    return;
  }
  target.innerHTML = `
    <table>
      <thead>
        <tr><th>Software</th><th>Instalada</th><th>Disponible</th><th>Criticidad</th><th>Nota</th></tr>
      </thead>
      <tbody>
        ${updates
          .map(
            (u) => `
          <tr>
            <td><strong>${esc(u.software)}</strong></td>
            <td>${esc(u.installedVersion || "—")}</td>
            <td>${esc(u.availableVersion || "—")}</td>
            <td><span class="badge ${criticidadTone(u.criticality)}">${esc(u.criticality ?? "—")}</span></td>
            <td>${esc(u.note || u.eol || "—")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderInventory(data) {
  const inventory = (data.config && data.config.inventory) || data.inventory || [];
  const target = document.getElementById("inventario");
  if (!inventory.length) {
    target.innerHTML = '<p class="empty">Sin inventario declarado.</p>';
    return;
  }
  target.innerHTML = inventory
    .map(
      (i) => `
      <div class="inv-item">
        <div class="row">
          <span class="name">${esc(i.name)}</span>
          <span class="badge ${criticidadTone(i.criticality)}">${esc(i.criticality ?? "—")}</span>
        </div>
        <div class="ver">${esc(i.version || "versión —")}${i.environment ? ` · ${esc(i.environment)}` : ""}</div>
      </div>`
    )
    .join("");
}

function renderWatch(data) {
  const watch =
    (data.config && data.config.watch) || data.watch || [];
  const target = document.getElementById("watch");
  target.innerHTML = watch.length
    ? watch.map((w) => `<span class="pill">${esc(w)}</span>`).join("")
    : '<p class="empty">Sin productos adicionales en vigilancia.</p>';

  const sources = (data.sync && data.sync.sources) || {};
  const snapshot = Object.entries(sources)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ");
  document.getElementById("fuentes").textContent = snapshot
    ? `Fuentes · ${snapshot}`
    : "";
}

function renderStatus(data) {
  const status = document.getElementById("status");
  status.textContent = `Última sync: ${fmtDate(data.lastSyncAt)}`;
}

function render(data) {
  state.data = data;
  renderStatus(data);
  renderKpis(data);
  renderPrioridad(data);
  renderUpdates(data);
  renderInventory(data);
  renderWatch(data);
}

async function load() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    document.getElementById("status").textContent = "Sin conexión";
    console.error(error);
  }
}

async function sync() {
  const button = document.getElementById("sync");
  button.disabled = true;
  button.textContent = "Sincronizando…";
  try {
    await fetch("/api/sync", { method: "POST" });
    setTimeout(load, 4000);
    setTimeout(load, 12000);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "Sincronizar";
    }, 4000);
  }
}

document.getElementById("sync").addEventListener("click", sync);
load();
setInterval(load, 60000);
