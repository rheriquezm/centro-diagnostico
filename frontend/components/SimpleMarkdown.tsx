import type { ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyBase}-${i}`}>{part}</span>
    )
  );
}

export default function SimpleMarkdown({ text }: { text: string }) {
  const lines = (text || "").split(/\r?\n/);
  const out: ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: string) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${key}`} className="ml-4 list-disc space-y-1">
          {list.map((li, i) => (
            <li key={i}>{inline(li, `li-${key}-${i}`)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (t.startsWith("- ") || t.startsWith("* ")) {
      list.push(t.slice(2));
      return;
    }
    flush(String(idx));
    if (t.startsWith("> ")) {
      out.push(
        <blockquote
          key={`q-${idx}`}
          className="my-1 rounded-r border-l-2 border-gob-info bg-surface-soft px-3 py-1.5 text-xs italic text-content-muted"
        >
          {inline(t.slice(2), `q-${idx}`)}
        </blockquote>
      );
    } else if (t) {
      out.push(
        <p key={`p-${idx}`} className="leading-relaxed">
          {inline(t, `p-${idx}`)}
        </p>
      );
    }
  });
  flush("end");

  return <div className="space-y-1.5">{out}</div>;
}
