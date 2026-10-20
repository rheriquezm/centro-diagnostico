function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineHtml(s: string): string {
  return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function mdToHtml(text: string): string {
  const lines = (text || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("- ") || t.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineHtml(t.slice(2))}</li>`;
      continue;
    }
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (t.startsWith("> ")) {
      html += `<blockquote>${inlineHtml(t.slice(2))}</blockquote>`;
    } else if (t) {
      html += `<p>${inlineHtml(t)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

export function exportarInforme(
  titulo: string,
  secciones: Array<{ titulo?: string; html: string }>
): void {
  const body = secciones
    .map((s) => (s.titulo ? `<h2>${escapeHtml(s.titulo)}</h2>` : "") + s.html)
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapeHtml(titulo)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Segoe UI",Arial,sans-serif;color:#0f172a;padding:36px;line-height:1.55;max-width:900px;margin:auto}
  h1{font-size:20px;margin:0 0 4px}
  .meta{color:#64748b;font-size:12px;margin-bottom:22px;border-bottom:2px solid #003390;padding-bottom:10px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#334155;margin:22px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
  p{margin:6px 0}
  ul{margin:6px 0 6px 18px}
  li{margin:3px 0}
  blockquote{margin:6px 0;padding:8px 12px;background:#f1f5f9;border-left:3px solid #007bff;color:#475569;font-style:italic;border-radius:0 6px 6px 0}
  strong{color:#0f172a}
  footer{margin-top:28px;color:#94a3b8;font-size:11px;text-align:center}
</style></head><body>
<h1>${escapeHtml(titulo)}</h1>
<div class="meta">Generado el ${new Date().toLocaleString("es-CL")} · Centro de Diagnóstico</div>
${body}
<footer>Documento generado automáticamente. El análisis es una hipótesis asistida; verifique contra el contrato.</footer>
</body></html>`;

  const win = window.open("", "_blank", "width=920,height=720");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}
