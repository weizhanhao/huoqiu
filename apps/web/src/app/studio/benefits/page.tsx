import type { Metadata } from "next";

import { StudioBenefits } from "../../../features/studio/studio-benefits";

export const metadata: Metadata = {
  description: "创作者专栏与打赏悬赏的开通条件",
  title: "创作者权益 · 创作者中心 · 火球",
};

export default function StudioBenefitsPage() {
  return <StudioBenefits />;
}
