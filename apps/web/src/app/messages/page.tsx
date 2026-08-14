import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { MessagesExperience } from "../../features/account/messages-experience";

export const metadata: Metadata = {
  description: "注册账号之间的一对一私信，消息保存在本机服务端",
  title: "私信 · 火球",
};

export default function MessagesPage() {
  return (
    <DesktopShell activeUtility="notifications">
      <MessagesExperience />
    </DesktopShell>
  );
}
