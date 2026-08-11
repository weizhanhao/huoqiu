import type { Metadata } from "next";

import { DesktopShell } from "../../../components/shell/desktop-shell";
import { ProfilePageExperience } from "../../../features/profile-settings/profile-settings-experience";

export const metadata: Metadata = {
  description: "火球固定合成用户主页演示",
  title: "火球演示用户 · 火球",
};

export default function SyntheticUserProfilePage() {
  return (
    <DesktopShell>
      <ProfilePageExperience />
    </DesktopShell>
  );
}
