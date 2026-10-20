const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function Heatmap({
  grid,
  max,
}: {
  grid: number[][];
  max: number;
}) {
  const color = (v: number) => {
    if (!v || max === 0) return "var(--surface-soft)";
    const t = Math.min(v / max, 1);
    return `rgba(0, 123, 255, ${0.12 + t * 0.88})`;
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex">
            <div className="w-8 shrink-0" />
            <div className="flex flex-1">
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className="flex-1 text-center text-[9px] text-content-muted"
                >
                  {h % 2 === 0 ? h : ""}
                </span>
              ))}
            </div>
          </div>
          {grid.map((fila, wd) => (
            <div key={wd} className="mt-0.5 flex items-center">
              <div className="w-8 shrink-0 pr-1 text-right text-[10px] text-content-muted">
                {DIAS[wd]}
              </div>
              <div className="flex flex-1 gap-0.5">
                {fila.map((v, h) => (
                  <div
                    key={h}
                    className="h-4 flex-1 rounded-sm transition hover:ring-1 hover:ring-gob-info"
                    style={{ background: color(v) }}
                    title={`${DIAS[wd]} ${h}:00 → ${v} accesos`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-content-muted">
        <span>Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className="h-3 w-4 rounded-sm"
            style={{ background: color(t * max) }}
          />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
