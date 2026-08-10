type UnavailableActionProperties = Readonly<{
  icon?: string;
  label: string;
}>;

export function UnavailableAction({
  icon = "·",
  label,
}: UnavailableActionProperties) {
  return (
    <details className="unavailable-action">
      <summary aria-label={`${label}，暂未开放`}>
        <span className="unavailable-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </summary>
      <span className="unavailable-popover" role="status">
        <strong>此功能暂未开放</strong>
        <span>我们正在完善体验，再次点击可收起。</span>
      </span>
    </details>
  );
}
