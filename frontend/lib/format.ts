export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-CL", { hour12: false });
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const future = diff < 0;
  const seconds = Math.round(Math.abs(diff) / 1000);
  let texto: string;
  if (seconds < 10) texto = "unos segundos";
  else if (seconds < 60) texto = `${seconds} s`;
  else if (seconds < 3600) texto = `${Math.round(seconds / 60)} min`;
  else if (seconds < 86400) texto = `${Math.round(seconds / 3600)} h`;
  else texto = `${Math.round(seconds / 86400)} d`;
  return future ? `en ${texto}` : `hace ${texto}`;
}
