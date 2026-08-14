import { afterEach, describe, expect, it, vi } from "vitest";

import { loadFundList, parseRankData } from "../../src/server/fund-list.server";

/*
 * 基金列表。
 *
 * 基金中心此前列的是六只写死的基金（fund_syn_0001…），名字、收益、规模全是
 * 编的，而站内唯一一只真实基金从列表里根本走不到。
 *
 * 上游是天天基金的公开排行接口，回的是一段 JS 赋值语句而不是 JSON，
 * 每一行用竖线分隔。列序用两个独立来源对过（pingzhongdata 的 syl_* 与
 * f10/lsjz 的 FSRQ/DWJZ/JZZZL），这一份把那个列序钉住：错一位，
 * 页面上「近一年 +212%」显示的就会是「近两年」的数字，而它看起来一样正常。
 *
 * 值是照真实结构改写的合成数据。
 */

const ROW = [
  "001480",
  "示例成长混合A",
  "混合型",
  "2026-08-12",
  "7.7290",
  "2.41",
  "8.14",
  "-8.12",
  "23.51",
  "91.83",
  "212.16",
  "426.86",
  "398.65",
  "94.39",
  "672.90",
].join("|");

const bodyOf = (...rows: readonly string[]): string =>
  `var rankData = {datas:[${rows
    .map((row) => `"${row}"`)
    .join(",")}],allRecords:5217,pageIndex:1,pageNum:20,allPages:261,allNum:5217};`;

let requested = "";

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    requested = String(input);
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
});

describe("the fund ranking body is not JSON", () => {
  it("pulls the rows out of the assignment statement", () => {
    /*
     * 键名没有引号，JSON.parse 会直接抛。用 eval 就等于让上游在本进程里
     * 执行任意代码——这是外部数据，不能给它这个权限。
     */
    const parsed = parseRankData(bodyOf(ROW));

    expect(parsed?.rows).toEqual([ROW]);
    expect(parsed?.total).toBe(5217);
  });

  it("keeps a fund whose name contains a comma in one piece", () => {
    /*
     * 行与行之间用逗号分隔，而基金简称里也可能有逗号。按逗号硬切的话，
     * 那一只会被劈成两行：前半段代码对不上被丢掉，后半段则成了一行
     * 没有代码的垃圾数据。
     */
    const tricky = ROW.replace("示例成长混合A", "示例成长,进取混合A");

    const parsed = parseRankData(bodyOf(tricky, ROW));

    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[0]).toBe(tricky);
  });

  it("returns nothing when the body is not what we expect", () => {
    expect(parseRankData("<html>404</html>")).toBeNull();
  });
});

describe("fund rows carry the returns their column really holds", () => {
  it("maps each pipe column onto the name the page renders", async () => {
    stubUpstream(bodyOf(ROW));

    const list = await loadFundList({ category: "hybrid" });

    expect(list?.rows[0]).toEqual({
      category: "混合型",
      code: "001480",
      dayPct: 2.41,
      name: "示例成长混合A",
      nav: 7.729,
      navDate: "2026-08-12",
      oneMonthPct: -8.12,
      oneYearPct: 212.16,
      sixMonthPct: 91.83,
      threeMonthPct: 23.51,
      threeYearPct: 398.65,
      yearToDatePct: 94.39,
    });
    expect(list?.total).toBe(5217);
  });

  it("turns a missing return into a real absence, not into zero", async () => {
    // 成立不满一年的基金没有近一年收益，上游给的是空串。
    const young = ROW.split("|");
    young[10] = "";
    young[12] = "";
    stubUpstream(bodyOf(young.join("|")));

    const list = await loadFundList({ category: "hybrid" });

    /*
     * 0 会让这只基金在收益榜上排进中游，看起来像一只不赚不赔的基金；
     * 只有 null 能让页面老实写「—」。
     */
    expect(list?.rows[0]?.oneYearPct).toBeNull();
    expect(list?.rows[0]?.threeYearPct).toBeNull();
    expect(list?.rows[0]?.dayPct).toBe(2.41);
  });

  it("asks the endpoint for the category and ordering the caller wants", async () => {
    stubUpstream(bodyOf(ROW));

    await loadFundList({ category: "bond", page: 2, sort: "yearToDate" });

    /*
     * 分类和排序必须是服务端做的。只把当前这一页重排，得到的是
     * 「这 20 只里的顺序」，却会被读成「全市场今年来最好的 20 只」。
     */
    expect(requested).toContain("ft=zq");
    expect(requested).toContain("sc=jn");
    expect(requested).toContain("pi=2");
  });

  it("drops a row that has no usable code", async () => {
    // 代码不成形的行既没法展示也没法点进去，留着就是一行点不动的东西。
    stubUpstream(bodyOf("|无代码基金|混合型|2026-08-12|1.0|0.1", ROW));

    const list = await loadFundList({ category: "hybrid" });

    expect(list?.rows).toHaveLength(1);
    expect(list?.rows[0]?.code).toBe("001480");
  });

  it("refuses a page number that is not a real page", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(bodyOf(ROW), { status: 200 });
    });

    for (const page of [0, -1, 1.5, Number.NaN, 10_000]) {
      expect(await loadFundList({ category: "hybrid", page })).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when upstream fails", async () => {
    stubUpstream(null);

    expect(await loadFundList({ category: "hybrid" })).toBeNull();
  });
});
