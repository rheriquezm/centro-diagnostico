export default function Placeholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-content">{title}</h2>
      <div className="card space-y-2">
        <span className="inline-block rounded-full bg-gob-info px-2.5 py-0.5 text-xs font-medium text-white">
          {phase}
        </span>
        <p className="text-content-muted">{description}</p>
        <p className="text-sm text-content-muted">
          Esta sección se implementará en la fase indicada. No se muestran datos
          simulados.
        </p>
      </div>
    </div>
  );
}
