export default function BarChart({
  data,
  height = 180,
  color = "#007bff",
  emptyText = "Sin datos.",
}: {
  data: { label: string | number; value: number }[];
  height?: number;
  color?: string;
  emptyText?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || max === 0) {
    return <p className="text-sm text-content-muted">{emptyText}</p>;
  }

  return (
    <div className="flex gap-2">
      <div
        className="flex w-9 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-content-muted"
        style={{ height }}
      >
        <span>{max.toLocaleString("es-CL")}</span>
        <span>{Math.round(max / 2).toLocaleString("es-CL")}</span>
        <span>0</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {[0, 0.5, 1].map((f) => (
            <div
              key={f}
              className="absolute inset-x-0 border-t border-surface-border/60"
              style={{ top: `${f * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {data.map((d) => (
              <div
                key={d.label}
                className="group flex h-full flex-1 items-end justify-center"
              >
                <div
                  className="w-full rounded-t-md transition-all duration-300 group-hover:opacity-75"
                  style={{
                    height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%`,
                    background: color,
                    opacity: d.value > 0 ? 1 : 0.12,
                  }}
                  title={`${d.label}: ${d.value.toLocaleString("es-CL")}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          {data.map((d) => (
            <span
              key={d.label}
              className="flex-1 text-center text-[10px] text-content-muted"
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
