import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { SettingsPageExperience } from "../../features/profile-settings/profile-settings-experience";

export const metadata: Metadata = {
  description: "火球固定合成会话设置演示",
  title: "设置 · 火球",
};

export default function SettingsPage() {
  return (
    <DesktopShell activeUtility="settings">
      <SettingsPageExperience />
    </DesktopShell>
  );
}
