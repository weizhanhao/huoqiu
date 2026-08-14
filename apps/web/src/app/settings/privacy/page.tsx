import type { Metadata } from "next";

import { PrivacyPanel } from "../../../features/profile-settings/privacy-panel";

export const metadata: Metadata = {
  description: "设置谁可以评论你发布的讨论",
  title: "隐私设置 · 火球",
};

export default function SettingsPrivacyPage() {
  return <PrivacyPanel />;
}
