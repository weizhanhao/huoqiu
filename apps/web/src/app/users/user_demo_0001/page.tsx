import type { Metadata } from "next";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { ProfilePageExperience } from "../../../features/profile-settings/profile-settings-experience";

export const metadata: Metadata = {
  description: "内置样本账号的主页",
  title: "火球演示用户 · 火球",
};

export default function SyntheticUserProfilePage() {
  return (
    <DesktopShell activeUtility="profile">
      <ProfilePageExperience />
    </DesktopShell>
  );
}
