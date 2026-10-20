import Link from "next/link";

type Tone = "ok" | "warn" | "error" | "neutral";

const DOT: Record<Tone, string> = {
  ok: "bg-gob-success",
  warn: "bg-gob-warning",
  error: "bg-gob-error",
  neutral: "bg-content-muted/40",
};

export default function SourceCard({
  href,
  title,
  color,
  value,
  label,
  secondary,
  tone = "neutral",
  toneText,
}: {
  href: string;
  title: string;
  color: string;
  value: string | number;
  label: string;
  secondary?: string;
  tone?: Tone;
  toneText?: string;
}) {
  return (
    <Link
      href={href}
      className="card group relative flex flex-col gap-3 overflow-hidden transition hover:-translate-y-0.5 hover:border-gob-info hover:shadow-md"
    >
      <span
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-[0.12]"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: color }}
          >
            {title.charAt(0)}
          </span>
          <span className="truncate text-sm font-semibold text-content group-hover:text-gob-info">
            {title}
          </span>
        </span>
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`}
          title={toneText || ""}
        />
      </div>

      <div>
        <p className="text-3xl font-bold tabular-nums text-content">{value}</p>
        <p className="text-xs text-content-muted">{label}</p>
      </div>

      <p className="text-xs text-content-muted">{secondary || "\u00A0"}</p>
    </Link>
  );
}
