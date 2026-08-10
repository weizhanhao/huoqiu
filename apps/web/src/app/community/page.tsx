import { DesktopShell } from "../../components/shell/desktop-shell";
import { CommunityFeed } from "../../features/community/community-experience";

export default function CommunityPage() {
  return (
    <DesktopShell activeChannel="community">
      <CommunityFeed />
    </DesktopShell>
  );
}
