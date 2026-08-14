import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("profile and settings public routes", () => {
  /*
   * 原断言要求 users/[userId] 必须不存在，编码的是「全站只有一个写死的
   * 演示主页」这个前提。真实账号系统上线后这个前提不再成立——每个注册账号
   * 都必须有自己的主页。
   *
   * 于是把约束换成更强的一条：动态路由可以存在，但必须对查不到的 id 走
   * notFound()，并且绝不触碰口令散列字段。开放任意 id 不等于开放任意数据。
   */
  it("serves per-account profiles without leaking credentials or inventing users", () => {
    expect(
      existsSync(
        new URL("../../src/app/users/user_demo_0001/page.tsx", import.meta.url),
      ),
    ).toBe(true);
    expect(
      existsSync(new URL("../../src/app/settings/page.tsx", import.meta.url)),
    ).toBe(true);

    const dynamicRoute = readFileSync(
      new URL("../../src/app/users/[userId]/page.tsx", import.meta.url),
      "utf8",
    );
    expect(dynamicRoute).toContain("notFound()");

    const lookup = readFileSync(
      new URL(
        "../../src/features/account/profile-lookup.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    // 只禁止真正的属性访问；注释里提到这两个字段名是允许的。
    expect(lookup).not.toMatch(/\.passwordHash\b|\.salt\b/u);
    // 查不到资料时返回 null，交给路由 404，而不是编造一个占位用户。
    expect(lookup).toContain("return null");
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
