import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import {
  CommunityFeed,
  HomeCommunityStream,
  PostDetail,
} from "../../../src/features/community/community-experience";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the synthetic community browser harness root");
}

const pathname = window.location.pathname;
const surface =
  pathname === "/community/posts/post_syn_0001" ? (
    <PostDetail />
  ) : pathname === "/community" ? (
    <CommunityFeed />
  ) : (
    <HomeCommunityStream />
  );

createRoot(root).render(
  <>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <DesktopShell
      activeChannel={pathname === "/community" ? "community" : "home"}
    >
      {surface}
    </DesktopShell>
  </>,
);
