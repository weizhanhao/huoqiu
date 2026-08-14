import type { Metadata } from "next";

import { BlockedUsersPanel } from "../../../features/profile-settings/blocked-users-panel";

export const metadata: Metadata = {
  description: "管理已屏蔽的账号",
  title: "已屏蔽用户 · 火球",
};

export default function SettingsBlockedPage() {
  return <BlockedUsersPanel />;
}
