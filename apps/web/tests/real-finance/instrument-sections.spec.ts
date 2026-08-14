import { describe, expect, it } from "vitest";

import {
  bareCode,
  findInstrumentSection,
  instrumentSectionGroups,
  instrumentSections,
  isCompanyListing,
} from "../../src/features/real-finance/instrument-sections";

/*
 * 分区注册表是「标的详情有哪些分区」的唯一真相：导航、路由、页面标题都从它派生。
 * 这一份守的是它不会悄悄退化成一个「看起来能点但点不出东西」的清单。
 */

describe("instrument section registry", () => {
  it("never marks a section as external without a real address to go to", () => {
    for (const section of instrumentSections) {
      if (section.status !== "external") continue;
      /*
       * 标了「站外」却没有地址，导航就会渲染出一个点不动的外链。
       * 雪球这几项本身也是跳腾讯，我们同样给真实地址，而不是编一张表出来。
       */
      expect(section.externalHref, section.slug).toMatch(
        /^https:\/\/[\w.-]+\/.*\{code\}/u,
      );
    }
  });

  it("never marks a section as an in-site page without an address", () => {
    for (const section of instrumentSections) {
      if (section.status !== "site") continue;
      /*
       * 标了「站内独立页面」却没给地址，导航会渲染出一个点不动的链接。
       * 而选股器是跨标的的，它更不该指向 /instruments/<code>/screener——
       * 那条路由属于某一只股票，选股器不属于任何一只。
       */
      expect(section.siteHref, section.slug).toMatch(/^\/[\w/-]+$/u);
      expect(section.siteHref, section.slug).not.toContain("/instruments/");
    }
  });

  it("keeps every slug unique so one route cannot mean two things", () => {
    const slugs = instrumentSections.map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("finds a section by slug and refuses one that does not exist", () => {
    expect(findInstrumentSection("profile")?.label).toBe("公司简介");
    expect(findInstrumentSection("not-a-section")).toBeNull();
  });

  it("keeps the flattened list in step with the groups", () => {
    const fromGroups = instrumentSectionGroups.flatMap((group) => group.items);
    expect(instrumentSections).toEqual(fromGroups);
  });

  it("strips the market prefix for sites that address stocks by bare code", () => {
    // 腾讯那几页用的是不带市场前缀的六位代码。
    expect(bareCode("sz300862")).toBe("300862");
    expect(bareCode("sh600519")).toBe("600519");
  });
});

describe("telling a company apart from an index", () => {
  it("recognises the individual stocks", () => {
    // 快照里的三只个股，加上需求截图里的蓝盾光电。
    for (const symbol of ["sh600519", "sz000858", "sh601318", "sz300862"]) {
      expect(isCompanyListing(symbol), symbol).toBe(true);
    }
  });

  it("refuses the indices", () => {
    /*
     * 指数没有公司简介、没有高管、没有十大股东。
     * 把这三十个 F10 分区挂到上证指数上，点进去看到的会是一片空白——
     * 而空白读起来像「这个标的没披露」，不像「这个标的根本没有这种东西」。
     */
    for (const symbol of [
      "sh000001",
      "sz399001",
      "sz399006",
      "sh000300",
      "sh000905",
    ]) {
      expect(isCompanyListing(symbol), symbol).toBe(false);
    }
  });

  it("refuses anything that is not a well-formed A-share symbol", () => {
    for (const symbol of ["600519", "us:AAPL", "sz30086", "", "listing_0001"]) {
      expect(isCompanyListing(symbol), symbol).toBe(false);
    }
  });
});
