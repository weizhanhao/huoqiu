import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import {
  NotificationCenter,
  type NotificationFilter,
} from "../../features/notifications/notification-center";
import { notificationCategories } from "../../features/notifications/notification-fixtures";

export const metadata: Metadata = {
  description: "回复、提到我的、赞与收藏和系统消息",
  title: "消息中心 · 火球",
};

/*
 * 分类走 URL，不走组件内部状态。
 *
 * 这样侧栏四条子链接可以各自直达，链接也能被收藏和分享——
 * 之前它们全部指向 /notifications，点哪条都落到同一个默认视图。
 *
 * 取值必须命中已知分类白名单：URL 是用户可随手改的输入，不能拿它直接
 * 当筛选键用。
 */
const parseFilter = (
  value: string | readonly string[] | undefined,
): NotificationFilter => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const known = notificationCategories.some(({ id }) => id === candidate);
  return known ? (candidate as NotificationFilter) : "all";
};

export default async function NotificationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ category?: string | readonly string[] }>>;
}>) {
  const { category } = await searchParams;

  return (
    <DesktopShell activeUtility="notifications">
      <NotificationCenter initialFilter={parseFilter(category)} />
    </DesktopShell>
  );
}
