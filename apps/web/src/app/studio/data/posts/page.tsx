import type { Metadata } from "next";

import { StudioPostMetrics } from "../../../../features/studio/studio-metrics";

export const metadata: Metadata = {
  description: "逐篇作品的发布记录",
  title: "作品详情 · 创作者中心 · 火球",
};

export default function StudioPostDataPage() {
  return <StudioPostMetrics />;
}
