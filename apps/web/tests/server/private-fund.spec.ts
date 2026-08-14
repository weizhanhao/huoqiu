import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PAGE_SIZES,
  loadPrivateFundManagers,
  toDate,
} from "../../src/server/private-fund.server";

/*
 * 私募管理人登记信息（中基协公示）。
 *
 * 这一页此前是六只虚构产品，收益率、最大回撤全是编的。换成中基协公示
 * 的真实登记数据后，有四件事错了不会报错，只会给出一张看起来正常的错表：
 *
 *   1. `size` 必须是上游允许的那几档（10/20/50/100）。传 3 会被 400 掉。
 *      我一开始传 3，据此判定「中基协接口不可用」，白绕了一大圈；
 *   2. 筛选条件走 POST 的 body，不走 query。放进 query 会被静默忽略，
 *      于是界面上写着「私募证券投资基金管理人」，列出来的是全部类型；
 *   3. 日期是毫秒时间戳（UTC 零点编码），不是字符串；
 *   4. `paidInCapital` / `subscribedCapital` 不是金额。上海重阳这两个字段
 *      是 1 和 0，而它的实缴资本实际是 23,500 万元——当成金额显示出来，
 *      每一家的注册资本都会变成「1 万元」。
 *
 * 值是照真实结构改写的合成数据。
 */

const managerOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  artificialPersonName: "示例法定代表人",
  establishDate: 1_245_974_400_000,
  fundCount: 205,
  id: "101000000000",
  managerName: "示例资产管理有限公司",
  memberType: "普通会员",
  orgForm: "有限责任公司",
  paidInCapital: 1,
  primaryInvestType: "私募证券投资基金管理人",
  registerCity: "浦东新区",
  registerDate: 1_395_014_400_000,
  registerNo: "P1000000",
  registerProvince: "上海市",
  subscribedCapital: 0,
  url: "101000000000.html",
  ...overrides,
});

const bodyOf = (content: readonly unknown[], totalElements = 18_486): string =>
  JSON.stringify({ content, totalElements });

let lastUrl = "";
let lastInit: RequestInit | undefined;

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    lastUrl = String(input);
    lastInit = init;
    if (body === null) return new Response("", { status: 400 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  lastUrl = "";
  lastInit = undefined;
});

describe("epoch dates", () => {
  it("reads the calendar day the registry itself shows", () => {
    /*
     * 1245974400000 在中基协自己的详情页上显示为「成立时间 2009-06-26」，
     * 1395014400000 显示为「登记时间 2014-03-17」——这两对是照着页面核过的。
     */
    expect(toDate(1_245_974_400_000)).toBe("2009-06-26");
    expect(toDate(1_395_014_400_000)).toBe("2014-03-17");
  });

  it("refuses what is not a date", () => {
    // 登记信息里成立时间可以是空的，不能因此显示成 1970-01-01。
    for (const value of [null, undefined, "2009-06-26", Number.NaN, 0]) {
      expect(toDate(value), String(value)).toBeNull();
    }
  });
});

describe("loading registered managers", () => {
  it("asks for a page size the registry accepts", async () => {
    stubUpstream(bodyOf([managerOf()]));

    await loadPrivateFundManagers({ size: 3 });

    /*
     * 上游只认 10/20/50/100，别的一律 400。3 会让整页空掉，而错误看起来
     * 像是「中基协没有数据」。
     */
    expect(lastUrl).toContain("size=10");
    expect(PAGE_SIZES).toContain(10);
  });

  it("puts the filter in the body, not the query", async () => {
    stubUpstream(bodyOf([managerOf()]));

    await loadPrivateFundManagers({
      investType: "私募证券投资基金管理人",
      keyword: "高毅",
    });

    /*
     * 放进 query 会被静默忽略：照常回 200、照常回一整页数据，只是没筛过。
     * 界面上写着「私募证券投资基金管理人 · 7224 家」，列的却是全部 18486 家。
     */
    expect(lastUrl).not.toContain("investType");
    expect(lastUrl).not.toContain("keyword");
    expect(lastInit?.method).toBe("POST");
    expect(JSON.parse(String(lastInit?.body))).toEqual({
      keyword: "高毅",
      primaryInvestType: "私募证券投资基金管理人",
    });
  });

  it("sends an empty object when nothing is filtered", async () => {
    stubUpstream(bodyOf([managerOf()]));

    await loadPrivateFundManagers({});

    // 上游对空 body 回 500，对 `{}` 回 200。
    expect(String(lastInit?.body)).toBe("{}");
  });

  it("keeps the registry's own identifiers and counts", async () => {
    stubUpstream(
      bodyOf([
        managerOf({
          artificialPersonName: "示例代表",
          fundCount: 829,
          managerName: "示例高毅资产管理合伙企业（有限合伙）",
          registerNo: "P1002305",
        }),
      ]),
    );

    const page = await loadPrivateFundManagers({});

    expect(page?.managers[0]).toMatchObject({
      fundCount: 829,
      legalPerson: "示例代表",
      name: "示例高毅资产管理合伙企业（有限合伙）",
      registerNo: "P1002305",
    });
    expect(page?.total).toBe(18_486);
  });

  it("never presents the capital flags as amounts", async () => {
    stubUpstream(
      bodyOf([managerOf({ paidInCapital: 1, subscribedCapital: 0 })]),
    );

    const page = await loadPrivateFundManagers({});
    const manager = page?.managers[0] ?? {};

    /*
     * 这两个字段不是金额。上海重阳的 paidInCapital 是 1，而它的实缴资本
     * 是 23,500 万元。当成金额显示出来，全站每一家的注册资本都会是
     * 「1 万元」——一个看不出错的错。
     */
    expect(JSON.stringify(manager)).not.toContain("apital");
  });

  it("links to the registry's own disclosure page", async () => {
    stubUpstream(bodyOf([managerOf({ url: "101000002641.html" })]));

    const page = await loadPrivateFundManagers({});

    expect(page?.managers[0]?.disclosureUrl).toBe(
      "https://gs.amac.org.cn/amac-infodisc/res/pof/manager/101000002641.html",
    );
  });

  it("drops a record with no manager name", async () => {
    stubUpstream(
      bodyOf([managerOf(), managerOf({ id: "x", managerName: null })]),
    );

    const page = await loadPrivateFundManagers({});

    expect(page?.managers).toHaveLength(1);
  });

  it("returns nothing when the registry refuses", async () => {
    stubUpstream(null);
    // 空列表会被读成「没有符合条件的管理人」，那是另一回事。
    expect(await loadPrivateFundManagers({})).toBeNull();
  });

  it("returns nothing when a 200 carries no list at all", async () => {
    /*
     * 这个上游出错时不一定给非 2xx：它会回 200 带一段别的东西
     * （空 body 回 500，参数不对回 400，但也见过回 200 带错误对象的）。
     * 只要 content 不是数组，就是没取到——不能当成「一家都没有」。
     */
    for (const body of [
      JSON.stringify({ message: "系统繁忙" }),
      JSON.stringify({ content: null, totalElements: 0 }),
      JSON.stringify({ content: {}, totalElements: 0 }),
    ]) {
      stubUpstream(body);
      expect(await loadPrivateFundManagers({}), body).toBeNull();
    }
  });

  it("reports an honest empty page when the filter matches nobody", async () => {
    stubUpstream(bodyOf([], 0));

    const page = await loadPrivateFundManagers({ keyword: "不存在的管理人" });

    // 这一种才是真的「没有匹配」，要和取不到区分开。
    expect(page).toEqual({ managers: [], page: 0, total: 0 });
  });
});
