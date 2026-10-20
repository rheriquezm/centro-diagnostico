export default function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="card relative overflow-hidden">
      {accent ? (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: accent }}
        />
      ) : null}
      <p className="card-title">{label}</p>
      <p className="kpi">{value}</p>
      {hint ? <p className="mt-1 text-xs text-content-muted">{hint}</p> : null}
    </div>
  );
}
