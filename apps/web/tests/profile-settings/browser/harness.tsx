import { cssVariables } from "@huoqiu/web-ui";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import {
  ProfilePageExperience,
  SettingsPageExperience,
} from "../../../src/features/profile-settings/profile-settings-experience";
import { ProfileSessionProvider } from "../../../src/features/profile-settings/profile-session";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the profile browser harness root element");
}

function HarnessRouter() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  return (
    <DesktopShell>
      {path === "/settings" ? (
        <SettingsPageExperience />
      ) : (
        <ProfilePageExperience />
      )}
    </DesktopShell>
  );
}

createRoot(root).render(
  <ProfileSessionProvider>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <HarnessRouter />
  </ProfileSessionProvider>,
);
