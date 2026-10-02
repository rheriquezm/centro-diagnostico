const STYLES: Record<string, string> = {
  ERROR: "bg-gob-error text-white",
  FATAL: "bg-gob-error text-white",
  WARN: "bg-gob-warning text-white",
  INFO: "bg-gob-info text-white",
  success: "bg-gob-success text-white",
  warning: "bg-gob-warning text-white",
  error: "bg-gob-error text-white",
  info: "bg-gob-info text-white",
  neutral: "bg-surface-soft text-content",
};

export default function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof STYLES | string;
}) {
  const style = STYLES[tone] || STYLES.neutral;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}
