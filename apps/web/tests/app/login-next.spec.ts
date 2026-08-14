import { describe, expect, it } from "vitest";

import { safeNextPath } from "../../src/features/account/auth-experience";

/*
 * 登录后回到刚才那一页。
 *
 * 站内很多地方是「点了才发现要登录」——关注一个组合、收藏一条帖子。登录页
 * 此前不接受任何回跳参数，成功之后一律停在原地，用户得自己走回去。
 *
 * 这一份守的是那条参数不能把人送出站。`//evil.example` 是协议相对地址，
 * 浏览器会当成另一个源：攻击者拿一条本站的登录链接就能把人送到伪造页面上，
 * 而地址栏从头到尾都是本站域名。
 */

describe("the post-login destination stays inside this site", () => {
  it("keeps an ordinary in-site path", () => {
    expect(safeNextPath("/portfolios/pf_0000000000000000")).toBe(
      "/portfolios/pf_0000000000000000",
    );
    expect(safeNextPath("/watchlist?tab=funds")).toBe("/watchlist?tab=funds");
  });

  it("refuses anything that could leave this origin", () => {
    for (const raw of [
      // 协议相对地址：浏览器解析成 https://evil.example。
      "//evil.example/login",
      // 反斜杠变体，同样会被解析成另一个源。
      "/\\evil.example",
      "https://evil.example",
      "http://evil.example",
      // 没有前导斜杠的相对路径拼在当前路径后面，去向不确定。
      "portfolios",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(raw), raw).toBeNull();
    }
  });

  it("treats a missing parameter as no redirect", () => {
    expect(safeNextPath(null)).toBeNull();
  });
});
