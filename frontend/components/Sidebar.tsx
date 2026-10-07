"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; color?: string };

const ANALISIS: Item[] = [
  { href: "/graylog", label: "Graylog", color: "#007bff" },
  { href: "/redmine", label: "Redmine", color: "#2c8c3a" },
  { href: "/cerradura", label: "Cerradura Yale", color: "#f6a500" },
  { href: "/accesos", label: "Control de Acceso", color: "#7c3aed" },
  { href: "/nagios", label: "Nagios", color: "#d93025" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? "bg-gob-blue text-white" : "text-content hover:bg-surface-card"
    }`;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-surface-border bg-surface-soft">
      <div className="border-b border-surface-border px-5 py-4">
        <p className="text-xs uppercase tracking-widest text-content-muted">
          Servicio Civil
        </p>
        <h1 className="text-lg font-semibold text-content">
          Centro de Diagnóstico
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          <li>
            <Link href="/" className={linkClass(isActive("/"))}>
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  isActive("/") ? "bg-white" : "bg-gob-blue"
                }`}
              />
              Dashboard
            </Link>
          </li>
        </ul>

        <p className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
          Análisis
        </p>
        <ul className="space-y-1">
          {ANALISIS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} className={linkClass(active)}>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: active ? "#ffffff" : item.color }}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
