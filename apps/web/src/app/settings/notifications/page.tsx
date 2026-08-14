import type { Metadata } from "next";

import { NotificationPrefsPanel } from "../../../features/profile-settings/notification-prefs-panel";

/*
 * 消息提醒设置。
 *
 * 这一页此前只是一句「尚未实现」的说明——那时确实没做，写清楚比放一排
 * 点了不生效的开关强。现在五个分类都能真正关闭，且过滤发生在服务端：
 * 关掉的分类不再进通知列表，也不计入未读。
 */
export const metadata: Metadata = {
  description: "按通知分类逐项开关",
  title: "消息提醒设置 · 火球",
};

export default function SettingsNotificationsPage() {
  return <NotificationPrefsPanel />;
}
