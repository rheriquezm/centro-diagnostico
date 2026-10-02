import { colorAt } from "@/lib/palette";

type Item = { nombre: string; total: number; ocurrencias?: number };

export default function BarList({
  items,
  tone,
  colorful = false,
  emptyText = "Sin datos.",
}: {
  items: Item[];
  tone?: string;
  colorful?: boolean;
  emptyText?: string;
}) {
  const lista = items.filter((i) => i.total > 0);
  const max = Math.max(...lista.map((i) => i.total), 1);
  if (lista.length === 0) {
    return <p className="text-sm text-content-muted">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3 text-sm">
      {lista.map((item, index) => {
        const pct = Math.round((item.total / max) * 100);
        return (
          <li key={item.nombre} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium" title={item.nombre}>
                {item.nombre}
              </span>
              <span className="shrink-0 tabular-nums text-content-muted">
                {item.total.toLocaleString("es-CL")}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
              <div
                className={`h-full rounded-full transition-all ${tone || ""}`}
                style={{
                  width: `${pct}%`,
                  background: colorful ? colorAt(index) : undefined,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
