import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadInstrumentSnapshot } from "../../src/server/market-quote.server";

/*
 * 按需取任意 A 股代码的真实行情。
 *
 * 站内此前只有一份 8 标的的预生成快照，截图需求里的蓝盾光电 300862 根本不在
 * 其中。这里守的是「换成按需取之后，坏数据仍然进不来」。
 *
 * 测试不打真实接口：上游可用与否不该决定我们的测试是红是绿，而且反复跑
 * 也不该去骚扰人家的免费服务。响应用合成字节喂进去。
 */
/*
 * 名称的 GBK 字节，取自真实响应。
 *
 * 上游发的是 GBK，测试如果用 UTF-8 拼一份假响应，就绕开了解码这一步——
 * 那样即使解码写错也测不出来（第一次跑就是这么发现的：断言拿到一串乱码）。
 * Node 没有内置 GBK 编码器，所以这里直接放真实字节：c0b6b6dcb9e2b5e7 → 蓝盾光电。
 */
const NAME_GBK = Buffer.from("c0b6b6dcb9e2b5e7", "hex");

const QUOTE_FIELDS = [
  "", // 0 名称占位，拼接时换成真实 GBK 字节
  "39.410", // 1 今开
  "32.840", // 2 昨收
  "39.410", // 3 现价
  "39.410", // 4 最高
  "39.410", // 5 最低
  "39.410", // 6 买一
  "0.000", // 7 卖一
  "9989135", // 8 成交量(股)
  "393671810.350", // 9 成交额(元)
  /*
   * 10-29 五档买卖，「先量后价」交替：[10..19] 买一到买五、
   * [20..29] 卖一到卖五。这个排列是拿真实报价串看出来的。
   *
   * 这里给有梯度的值而不是一排 0：全 0 的话价格全被判成 null，
   * 那条「买价递减、卖价递增」的断言会一条都不执行，等于没测。
   */
  "842",
  "39.400", // 买一
  "400",
  "39.390", // 买二
  "2900",
  "39.380", // 买三
  "300",
  "39.370", // 买四
  "100",
  "39.360", // 买五
  "200",
  "39.420", // 卖一
  "100",
  "39.430", // 卖二
  "100",
  "39.440", // 卖三
  "800",
  "39.450", // 卖四
  "100",
  "39.460", // 卖五
  "2026-08-13", // 30 日期
  "11:12:21", // 31 时间
  "00", // 32 状态
];

/** 名称段用真实 GBK 字节，其余字段是 ASCII，拼出与上游同构的字节流。 */
const quoteBody = (fields: readonly string[]): Buffer =>
  Buffer.concat([
    Buffer.from('var hq_str_sz300862="', "ascii"),
    NAME_GBK,
    Buffer.from(`,${fields.slice(1).join(",")}";\n`, "ascii"),
  ]);

const BARS = [
  {
    close: "32.840",
    day: "2026-08-12",
    high: "32.840",
    low: "32.840",
    open: "32.840",
    volume: "624220",
  },
  {
    close: "27.370",
    day: "2026-08-11",
    high: "27.370",
    low: "27.370",
    open: "27.370",
    volume: "880538",
  },
];

let directory = "";

/** 按 URL 分派合成响应；quote/bars 传 null 表示该请求失败。 */
const stubUpstream = (options: {
  bars?: unknown;
  quote?: Buffer | null;
}): void => {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("hq.sinajs.cn")) {
      const body = options.quote;
      if (body === null) return new Response("", { status: 500 });
      // Buffer 不是合法的 BodyInit，转成 Uint8Array 再喂给 Response。
      return new Response(new Uint8Array(body ?? quoteBody(QUOTE_FIELDS)), {
        status: 200,
      });
    }
    if (options.bars === null) return new Response("", { status: 500 });
    return new Response(JSON.stringify(options.bars ?? BARS), { status: 200 });
  });
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-market-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("on-demand instrument snapshot", () => {
  it("serves a symbol that was never in the prebuilt snapshot", async () => {
    stubUpstream({});

    const snapshot = await loadInstrumentSnapshot("sz300862");

    /*
     * 这正是这一项的意义：300862 不在那份 8 标的的快照里，
     * 此前站内对它没有任何真数据。
     */
    expect(snapshot?.name).toBe("蓝盾光电");
    expect(snapshot?.quote?.last).toBe(39.41);
    expect(snapshot?.quote?.prevClose).toBe(32.84);
    expect(snapshot?.bars).toHaveLength(2);
  });

  it("reads the five-level order book out of the same quote string", async () => {
    stubUpstream({});

    const snapshot = await loadInstrumentSnapshot("sz300862");

    /*
     * 字段排列是实测出来的，不是猜的：真实报价串里 [10..19] 是买一到买五、
     * [20..29] 是卖一到卖五，都按「先量后价」交替，且买价递减、卖价递增，
     * 现价正好落在买一与卖一之间。
     *
     * 买卖两侧弄反的话，页面上的盘口会把买盘画成卖盘——
     * 每个数字都是真的，只是站错了边，而肉眼看不出来。
     */
    const bids = snapshot?.quote?.bids ?? [];
    const asks = snapshot?.quote?.asks ?? [];
    expect(bids).toHaveLength(5);
    expect(asks).toHaveLength(5);

    // 买价从买一往下递减，卖价从卖一往上递增。
    for (let index = 1; index < bids.length; index += 1) {
      const previous = bids[index - 1]?.price;
      const current = bids[index]?.price;
      if (previous == null || current == null) continue;
      expect(current).toBeLessThanOrEqual(previous);
    }
    for (let index = 1; index < asks.length; index += 1) {
      const previous = asks[index - 1]?.price;
      const current = asks[index]?.price;
      if (previous == null || current == null) continue;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("refuses a symbol shape it does not recognise", async () => {
    stubUpstream({});

    // 形状不对就不发请求：别拿用户随手输入的东西去打上游。
    for (const symbol of ["300862", "us:AAPL", "sz30086", "", "sz30086x"]) {
      expect(await loadInstrumentSnapshot(symbol)).toBeNull();
    }
  });

  it("gives the name but no quote while trading is halted", async () => {
    // 停牌时现价是 0。把 0 当价格显示出去，页面上就多出一只跌到零的股票。
    stubUpstream({
      quote: quoteBody([
        ...QUOTE_FIELDS.slice(0, 3),
        "0.000",
        ...QUOTE_FIELDS.slice(4),
      ]),
    });

    const snapshot = await loadInstrumentSnapshot("sz300862");

    expect(snapshot?.name).toBe("蓝盾光电");
    expect(snapshot?.quote).toBeNull();
  });

  it("drops the whole series when one candle is self-inconsistent", async () => {
    stubUpstream({
      bars: [
        BARS[0],
        // 最高价低于收盘价：这根蜡烛画出来是错的。
        { ...BARS[1], close: "99.000", high: "27.370" },
      ],
    });

    const snapshot = await loadInstrumentSnapshot("sz300862");

    /*
     * 一根坏的就整条不要。连续序列里挖一个洞，所有由它推导的数字都会错，
     * 而界面上完全看不出来。
     */
    expect(snapshot?.bars).toEqual([]);
    expect(snapshot?.name).toBe("蓝盾光电");
  });

  it("returns nothing at all when the upstream quote fails", async () => {
    stubUpstream({ quote: null });

    // 拿不到就是拿不到，不回落到样本数据冒充真实行情。
    expect(await loadInstrumentSnapshot("sz300862")).toBeNull();
  });

  it("caches to disk and serves the cache without hitting upstream again", async () => {
    stubUpstream({});
    await loadInstrumentSnapshot("sz300862");

    const cached = JSON.parse(
      readFileSync(resolve(directory, "sz300862.json"), "utf8"),
    ) as { name: string };
    expect(cached.name).toBe("蓝盾光电");

    // 缓存新鲜时不该再打上游——这既是速度，也是对免费接口的礼貌。
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("", { status: 500 });
    });
    const second = await loadInstrumentSnapshot("sz300862");

    expect(calls).toBe(0);
    expect(second?.name).toBe("蓝盾光电");
  });

  it("keeps the last good snapshot when upstream goes down later", async () => {
    stubUpstream({});
    await loadInstrumentSnapshot("sz300862");

    // 让缓存过期，再让上游挂掉。
    const stale = JSON.parse(
      readFileSync(resolve(directory, "sz300862.json"), "utf8"),
    ) as Record<string, unknown>;
    writeFileSync(
      resolve(directory, "sz300862.json"),
      JSON.stringify({ ...stale, fetchedAt: "2020-01-01T00:00:00.000Z" }),
      "utf8",
    );
    stubUpstream({ quote: null });

    const snapshot = await loadInstrumentSnapshot("sz300862");

    /*
     * 上游临时挂掉时退回上一次的好数据，并保留它自己的 fetchedAt——
     * 界面据此说明「数据截至何时」，而不是假装刚刚取到。
     */
    expect(snapshot?.name).toBe("蓝盾光电");
    expect(snapshot?.fetchedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});
