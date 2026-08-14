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
      aria-label={environment ? "本地受保护预览环境" : "固定离线样本数据"}
    >
      {environment ? "本地受保护预览" : "样本数据 · 非实时"}
    </span>
  );
}
