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
      aria-label={environment ? "本地受保护预览环境" : "固定离线合成演示数据"}
    >
      {environment ? "本地受保护预览" : "演示数据 · 合成数据"}
    </span>
  );
}
