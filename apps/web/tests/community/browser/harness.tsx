import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import HomePage from "../../../src/app/page";
import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import {
  CommunityFeed,
  PostDetail,
} from "../../../src/features/community/community-experience";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the synthetic community browser harness root");
}

const renderHarness = async () => {
  const pathname = window.location.pathname;
  if (pathname === "/") {
    const home = await HomePage({ searchParams: Promise.resolve({}) });
    createRoot(root).render(
      <>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {home}
      </>,
    );
    return;
  }

  const surface =
    pathname === "/community/posts/post_syn_0001" ? (
      <PostDetail />
    ) : (
      <CommunityFeed />
    );

  createRoot(root).render(
    <>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      <DesktopShell>{surface}</DesktopShell>
    </>,
  );
};

void renderHarness();
