import type { Metadata } from "next";

import { DesktopShell } from "../../components/shell/desktop-shell";
import { VideosHub } from "../../features/channels/videos-hub";

export const metadata: Metadata = {
  description: "视频栏目与研究圆桌",
  title: "视频 · 火球",
};

export default function VideosPage() {
  return (
    <DesktopShell activeChannel="videos" requiresD0Fixture={false}>
      <VideosHub />
    </DesktopShell>
  );
}
