import type { Metadata } from "next";

import { ArticleEditor } from "../../../features/studio/article-editor";

export const metadata: Metadata = {
  description: "写一篇长文并发布到社区",
  title: "发布长文 · 创作者中心 · 火球",
};

export default function StudioPublishPage() {
  return <ArticleEditor />;
}
