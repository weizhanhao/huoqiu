import type { Metadata } from "next";

import { StudioContentList } from "../../../features/studio/studio-content";

export const metadata: Metadata = {
  description: "自己发布过的全部内容",
  title: "我的作品 · 创作者中心 · 火球",
};

export default function StudioContentPage() {
  return (
    <StudioContentList
      emptyHint="还没有已发布的内容。写一条发出去，这里就会有记录。"
      heading="我的作品"
      scope="published"
    />
  );
}
