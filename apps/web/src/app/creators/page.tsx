import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { CreatorsHub } from "../../features/channels/creators-hub";

export const metadata: Metadata = {
  description: "栏目作者与他们的观察记录",
  title: "达人 · 火球",
};

export default function CreatorsPage() {
  return (
    <DesktopShell activeChannel="creators" requiresD0Fixture={false}>
      <CreatorsHub />
    </DesktopShell>
  );
}
