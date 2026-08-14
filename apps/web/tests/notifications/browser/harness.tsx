import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { NotificationCenter } from "../../../src/features/notifications/notification-center";
import { NotificationSessionProvider } from "../../../src/features/notifications/notification-state";
import { syntheticNotifications } from "../../../src/features/notifications/notification-fixtures";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the browser harness root element");
}

document.addEventListener("click", (event) => {
  const origin = event.target;
  if (!(origin instanceof Element)) return;
  const link = origin.closest<HTMLAnchorElement>("a[href]");
  if (link === null) return;
  event.preventDefault();
  document.body.dataset.lastNavigation = link.getAttribute("href") ?? "";
});

/*
 * 样本由这里显式提供。
 *
 * 默认状态已经改成空的——否则站上每个人的顶栏都顶着一个编出来的未读数。
 * 这套 harness 测的是「有通知时的交互」，样本得自己带。
 */
createRoot(root).render(
  <NotificationSessionProvider initialNotifications={syntheticNotifications}>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <DesktopShell activeUtility="notifications">
      <NotificationCenter />
    </DesktopShell>
  </NotificationSessionProvider>,
);
