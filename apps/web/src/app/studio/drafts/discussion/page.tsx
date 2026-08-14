import type { Metadata } from "next";

import { StudioContentList } from "../../../../features/studio/studio-content";

export const metadata: Metadata = {
  description: "还没发出去的讨论草稿",
  title: "讨论草稿 · 创作者中心 · 火球",
};

export default function DiscussionDraftsPage() {
  return (
    <StudioContentList
      emptyHint="没有讨论草稿。发帖框里存下的草稿会出现在这里。"
      heading="讨论草稿"
      scope="draft-discussion"
    />
  );
}
