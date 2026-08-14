import { describe, expect, it } from "vitest";

import { profileTabItems } from "../../src/features/profile-settings/profile-fixtures";

/*
 * 演示主页上那几个页签里的链接。
 *
 * 「收藏」里有两条指向早就删掉的东西：/instruments/listing_syn_0001 和
 * /portfolios/portfolio_syn_0001。那批虚构标的和虚构组合在换成真实数据时
 * 一起清掉了，链接却留在这里——点进去是「没有找到这个页面」。
 *
 * 这一页本身是演示身份页，内容是样本没问题；但样本不等于可以点出 404。
 * 先许诺点得进去、再给一张空页，比不给链接更糟。
 */

describe("every link on the demo profile tabs points somewhere that exists", () => {
  it("does not link to instruments or portfolios that were deleted", () => {
    const hrefs = Object.values(profileTabItems).flatMap((items) =>
      items.map(({ href }) => href),
    );

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).not.toContain("listing_syn_");
      expect(href, href).not.toContain("portfolio_syn_");
      expect(href, href).not.toContain("etf_syn_");
      expect(href, href).not.toContain("fund_syn_");
    }
  });

  it("keeps every link inside this site", () => {
    for (const items of Object.values(profileTabItems)) {
      for (const { href } of items) {
        expect(href.startsWith("/"), href).toBe(true);
      }
    }
  });
});
