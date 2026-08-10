import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { NotificationCenter } from "../../features/notifications/notification-center";

export const metadata: Metadata = {
  title: "消息中心 · 火球",
  description: "火球固定合成消息中心演示",
};

export default function NotificationsPage() {
  return (
    <DesktopShell activeUtility="notifications">
      <NotificationCenter />
    </DesktopShell>
  );
}
