export default function Gauge({
  value,
  label,
  sublabel,
  color = "#007bff",
}: {
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const size = 140;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--surface-soft)"
              strokeWidth={13}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={13}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </g>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-content">
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-content">{label}</p>
      {sublabel ? <p className="text-xs text-content-muted">{sublabel}</p> : null}
    </div>
  );
}
