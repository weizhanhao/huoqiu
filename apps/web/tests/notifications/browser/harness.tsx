import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { NotificationCenter } from "../../../src/features/notifications/notification-center";
import { NotificationSessionProvider } from "../../../src/features/notifications/notification-state";

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

createRoot(root).render(
  <NotificationSessionProvider>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <DesktopShell activeUtility="notifications">
      <NotificationCenter />
    </DesktopShell>
  </NotificationSessionProvider>,
);
