import type { Metadata } from "next";

import { StudioMetrics } from "../../../../features/studio/studio-metrics";

export const metadata: Metadata = {
  description: "真实关注关系统计出的粉丝数据",
  title: "粉丝数据 · 创作者中心 · 火球",
};

export default function StudioFollowerDataPage() {
  return <StudioMetrics scope="followers" />;
}
