import type { Metadata } from "next";

import { StudioContentList } from "../../../../features/studio/studio-content";

export const metadata: Metadata = {
  description: "还没发出去的长文草稿",
  title: "长文草稿 · 创作者中心 · 火球",
};

export default function ArticleDraftsPage() {
  return (
    <StudioContentList
      emptyHint="没有长文草稿。在「发布长文」里存下的稿子会出现在这里。"
      heading="长文草稿"
      scope="draft-article"
    />
  );
}
