type DemoDataBadgeProperties = Readonly<{
  variant?: "environment" | "synthetic";
}>;

export function DemoDataBadge({
  variant = "synthetic",
}: DemoDataBadgeProperties) {
  const environment = variant === "environment";

  return (
    <span
      className="demo-data-badge"
      aria-label={environment ? "预览环境环境" : "固定离线样本数据"}
    >
      {environment ? "预览环境" : "样本数据 · 非实时"}
    </span>
  );
}
