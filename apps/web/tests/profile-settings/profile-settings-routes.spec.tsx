import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("profile and settings public routes", () => {
  it("defines only the fixed allowlisted profile route plus settings", () => {
    expect(
      existsSync(
        new URL("../../src/app/users/user_demo_0001/page.tsx", import.meta.url),
      ),
    ).toBe(true);
    expect(
      existsSync(
        new URL("../../src/app/users/[userId]/page.tsx", import.meta.url),
      ),
    ).toBe(false);
    expect(
      existsSync(new URL("../../src/app/settings/page.tsx", import.meta.url)),
    ).toBe(true);
  });

  it("mounts the profile session provider at the shared root layout boundary", () => {
    const layout = readFileSync(
      new URL("../../src/app/layout.tsx", import.meta.url),
      "utf8",
    );

    expect(layout).toContain("ProfileSessionProvider");
    expect(layout).toMatch(
      /<ProfileSessionProvider>[\s\S]*<NotificationSessionProvider>/u,
    );
  });

  it("keeps the feature offline and free of browser persistence", () => {
    const featureSources = [
      "../../src/features/profile-settings/profile-fixtures.ts",
      "../../src/features/profile-settings/profile-session.tsx",
      "../../src/features/profile-settings/profile-settings-experience.tsx",
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");

    expect(featureSources).not.toMatch(
      /\b(?:fetch|localStorage|sessionStorage|indexedDB)\b|\/api\//u,
    );
  });
});
