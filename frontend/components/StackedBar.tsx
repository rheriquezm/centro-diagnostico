type Segment = { nombre: string; total: number; color: string };

export default function StackedBar({
  segments,
  height = 16,
}: {
  segments: Segment[];
  height?: number;
}) {
  const total = segments.reduce((acc, s) => acc + s.total, 0);

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-surface-soft"
        style={{ height }}
      >
        {total > 0
          ? segments.map((s) =>
              s.total > 0 ? (
                <div
                  key={s.nombre}
                  style={{
                    width: `${(s.total / total) * 100}%`,
                    background: s.color,
                  }}
                  title={`${s.nombre}: ${s.total}`}
                />
              ) : null
            )
          : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.nombre} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-content-muted">
              {s.nombre}:{" "}
              <span className="font-medium tabular-nums text-content">{s.total}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
