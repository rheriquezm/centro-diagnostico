import { colorAt } from "@/lib/palette";

type Slice = { nombre: string; total: number; color?: string };

export default function Donut({
  data,
  size = 168,
  thickness = 22,
  centerLabel = "Total",
  centerValue,
  emptyText = "Sin datos.",
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  emptyText?: string;
}) {
  const items = data.filter((d) => d.total > 0);
  const total = items.reduce((acc, d) => acc + d.total, 0);
  if (total === 0) {
    return <p className="text-sm text-content-muted">{emptyText}</p>;
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--surface-soft)"
              strokeWidth={thickness}
            />
            {items.map((d, index) => {
              const length = (d.total / total) * circumference;
              const dashoffset = -offset;
              offset += length;
              return (
                <circle
                  key={d.nombre}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={d.color || colorAt(index)}
                  strokeWidth={thickness}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashoffset}
                >
                  <title>{`${d.nombre}: ${d.total} (${Math.round(
                    (d.total / total) * 100
                  )}%)`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-content">
            {(centerValue ?? total).toLocaleString("es-CL")}
          </span>
          <span className="text-xs text-content-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-[150px] flex-1 space-y-2 text-sm">
        {items.map((d, index) => (
          <li key={d.nombre} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: d.color || colorAt(index) }}
              />
              <span className="truncate" title={d.nombre}>
                {d.nombre}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-content-muted">
              {d.total.toLocaleString("es-CL")}
              <span className="ml-1 text-xs">
                ({Math.round((d.total / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
