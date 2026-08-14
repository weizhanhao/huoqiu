import type { Metadata } from "next";

import { StudioMetrics } from "../../../features/studio/studio-metrics";

export const metadata: Metadata = {
  description: "自己内容的真实互动数据",
  title: "数据总览 · 创作者中心 · 火球",
};

export default function StudioDataPage() {
  return <StudioMetrics scope="content" />;
}
