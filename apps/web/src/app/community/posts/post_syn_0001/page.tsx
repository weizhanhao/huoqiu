import type { Metadata } from "next";

import { DesktopShell } from "../../../../components/shell/desktop-shell";
import { PostDetail } from "../../../../features/community/community-experience";

/* 这条静态路由固定渲染首帖，标题直接写定即可。 */
export const metadata: Metadata = {
  description: "把长期观察拆成事实层、判断层与反例层的记录方法",
  title: "一份关于长期观察节奏的笔记 · 火球",
};

export default function PostDetailPage() {
  return (
    <DesktopShell>
      <PostDetail />
    </DesktopShell>
  );
}
