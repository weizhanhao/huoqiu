import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { BookmarksPage } from "../../features/account/bookmarks-page";

/*
 * 收藏。
 *
 * 收藏功能本来就在（按钮、bookmarks 表、主页上的「收藏」页签都是真的），
 * 只是没有自己的页面，也没有左栏入口——雪球把它放在「我的」里。
 */

export const metadata: Metadata = {
  description: "你收藏过的帖子",
  title: "收藏 · 火球",
};

export default function BookmarksRoute() {
  return (
    <DesktopShell activeUtility="profile">
      <BookmarksPage />
    </DesktopShell>
  );
}
