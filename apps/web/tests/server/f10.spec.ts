import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadCompanyExecutives,
  loadCompanyProfile,
  loadInsiderTrades,
  loadShareholders,
} from "../../src/server/f10.server";

/*
 * 公司资料来自东方财富 F10 的公开 JSON 接口（免费、无需鉴权，已实测可用）。
 *
 * 这一份守的是「换成真实来源之后，编造的东西仍然进不来」：
 * 上游缺字段就是缺，不补空串、不猜、不拿别的字段顶上。
 *
 * 测试不打真实接口——上游可用与否不该决定我们的测试是红是绿，反复跑也不该
 * 去骚扰人家的免费服务。
 */

/** 字段名与真实响应一致；值是照结构改写的合成数据。 */
const JBZL = {
  ADDRESS: "示例省示例市示例路 1 号",
  BUSINESS_SCOPE: "一般项目:仪器仪表制造;仪器仪表销售",
  EM2016: "机械设备-通用设备-仪器仪表",
  EMP_NUM: 1234,
  LEGAL_PERSON: "示例法人",
  ORG_NAME: "示例光电子股份有限公司",
  ORG_NAME_EN: "EXAMPLE PHOTOELECTRON CO.,LTD.",
  ORG_PROFILE: "公司主营业务为示例仪器的研发、生产与销售。",
  ORG_TEL: "0000-00000000",
  ORG_WEB: "www.example-listed.cn",
  PROVINCE: "示例省",
  REG_ADDRESS: "示例省示例市示例路 1 号",
  REG_CAPITAL: 12_345.678,
  SECRETARY: "示例董秘",
  SECURITY_NAME_ABBR: "示例光电",
  SECURITY_TYPE: "深交所创业板A股",
  TRADE_MARKET: "深圳证券交易所",
};

/** 上游日期一律带 00:00:00 时间段，模块负责归一成 YYYY-MM-DD。 */
const FXXG = {
  FOUND_DATE: "2001-03-15 00:00:00",
  ISSUE_PRICE: 21.66,
  LISTING_DATE: "2020-08-24 00:00:00",
  TOTAL_FUNDS: 543_210_000,
};

let directory = "";

const stubUpstream = (body: unknown, status = 200): void => {
  vi.stubGlobal("fetch", async () =>
    status === 200
      ? new Response(JSON.stringify(body), { status })
      : new Response("", { status }),
  );
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-f10-"));
  vi.stubEnv("HUOQIU_MARKET_CACHE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
  vi.unstubAllGlobals();
});

describe("company profile from the free F10 endpoint", () => {
  it("maps the real field names onto a shape the page can render", async () => {
    stubUpstream({ fxxg: [FXXG], jbzl: [JBZL] });

    const profile = await loadCompanyProfile("sz300862");

    expect(profile).toMatchObject({
      chineseName: "示例光电子股份有限公司",
      englishName: "EXAMPLE PHOTOELECTRON CO.,LTD.",
      foundedOn: "2001-03-15",
      industry: "机械设备-通用设备-仪器仪表",
      legalPerson: "示例法人",
      // 上游给的是 "2020-08-24 00:00:00"，页面上要显示的是日期，不是半截时间戳。
      listedOn: "2020-08-24",
      secretary: "示例董秘",
      symbol: "sz300862",
      website: "www.example-listed.cn",
    });
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    // 形状不对就不发请求：别拿用户随手输入的东西去打上游。
    for (const symbol of ["300862", "us:AAPL", "sz30086", "", "sz30086x"]) {
      expect(await loadCompanyProfile(symbol)).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("leaves a missing field null instead of filling in a blank", async () => {
    stubUpstream({
      fxxg: [{ ...FXXG, LISTING_DATE: null }],
      jbzl: [{ ...JBZL, ORG_WEB: null, SECRETARY: "" }],
    });

    const profile = await loadCompanyProfile("sz300862");

    /*
     * 缺就是缺。空串会在页面上渲染成一个「有这一项但内容为空」的行，
     * 看起来像是公司真的没有官网；null 才能让页面选择不显示这一项。
     */
    expect(profile?.website).toBeNull();
    expect(profile?.secretary).toBeNull();
    expect(profile?.listedOn).toBeNull();
    // 其余字段不受牵连。
    expect(profile?.chineseName).toBe("示例光电子股份有限公司");
  });

  it("returns nothing when the payload carries no company at all", async () => {
    stubUpstream({ fxxg: [], jbzl: [] });

    // 空数组说明这个代码在上游查不到，不是「查到了一家没有名字的公司」。
    expect(await loadCompanyProfile("sz300862")).toBeNull();
  });

  it("returns nothing when upstream fails and there is no cache", async () => {
    stubUpstream(null, 500);

    // 拿不到就是拿不到，不回落到样本数据冒充真实资料。
    expect(await loadCompanyProfile("sz300862")).toBeNull();
  });

  it("caches to disk and serves the cache without hitting upstream again", async () => {
    stubUpstream({ fxxg: [FXXG], jbzl: [JBZL] });
    await loadCompanyProfile("sz300862");

    const cached = JSON.parse(
      readFileSync(resolve(directory, "f10", "sz300862-profile.json"), "utf8"),
    ) as { chineseName: string };
    expect(cached.chineseName).toBe("示例光电子股份有限公司");

    // 公司资料一年也未必变一次，重复打免费接口既慢又不礼貌。
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("", { status: 500 });
    });
    const second = await loadCompanyProfile("sz300862");

    expect(calls).toBe(0);
    expect(second?.chineseName).toBe("示例光电子股份有限公司");
  });
});

/*
 * 高管名单来自新浪财经 F10 的公开页面（免费、无需鉴权，已实测可用）：
 *   https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpManager/stockid/300862.phtml
 * 页面按 Table1/Table2/Table3 依次给出「公司高管 / 历届董事会成员 / 历届监事会成员」。
 *
 * 这份响应是 GBK 的。测试如果用 UTF-8 拼一份假 HTML，就绕开了解码这一步——
 * 那样即使解码写错也测不出来（行情那份第一次跑就是这么发现的，断言拿到一串乱码）。
 * Node 没有内置 GBK 编码器，所以下面的中文全部是 iconv 生成的真实 GBK 字节，
 * 内容本身是合成的，不含任何真实高管姓名。
 */
const gbk = (hex: string): Buffer => Buffer.from(hex, "hex");

const HEADER_GBK = gbk("d0d520c3fb"); // 姓 名
const ROLE_HEADER_GBK = gbk("d6b020cef1"); // 职 务
const START_HEADER_GBK = gbk("c6f0cabcc8d5c6da"); // 起始日期
const END_HEADER_GBK = gbk("d6d5d6b9c8d5c6da"); // 终止日期
const NAME_A_GBK = gbk("cabec0fdbcd7"); // 示例甲
const NAME_B_GBK = gbk("cabec0fdd2d2"); // 示例乙
const NAME_C_GBK = gbk("cabec0fdb1fb"); // 示例丙
const ROLE_CEO_GBK = gbk("d7dcbeadc0ed"); // 总经理
const ROLE_DIRECTOR_GBK = gbk("b6c0c1a2b6adcac2"); // 独立董事
const ROLE_SUPERVISOR_GBK = gbk("bce0cac2bbe1d6f7cfaf"); // 监事会主席

const ascii = (value: string): Buffer => Buffer.from(value, "ascii");

const row = (cells: readonly Buffer[]): Buffer =>
  Buffer.concat([
    ascii("<tr>"),
    ...cells.flatMap((cell) => [ascii("<td>"), cell, ascii("</td>")]),
    ascii("</tr>"),
  ]);

const headerRow = row([
  HEADER_GBK,
  ROLE_HEADER_GBK,
  START_HEADER_GBK,
  END_HEADER_GBK,
]);

const table = (id: string, bodyRows: readonly Buffer[]): Buffer =>
  Buffer.concat([
    ascii(`<table id="${id}">`),
    headerRow,
    ...bodyRows,
    ascii("</table>"),
  ]);

/** 与真实页面同构：三张表，列序一致，在任者终止日期是 "--"。 */
const executivesHtml = (): Buffer =>
  Buffer.concat([
    ascii("<html><body>"),
    table("Table1", [
      row([NAME_A_GBK, ROLE_CEO_GBK, ascii("2022-01-28"), ascii("--")]),
    ]),
    table("Table2", [
      row([
        NAME_B_GBK,
        ROLE_DIRECTOR_GBK,
        ascii("2019-01-25"),
        ascii("2022-01-27"),
      ]),
    ]),
    table("Table3", [
      row([NAME_C_GBK, ROLE_SUPERVISOR_GBK, ascii("2024-12-30"), ascii("--")]),
    ]),
    ascii("</body></html>"),
  ]);

const stubExecutives = (body: Buffer | null): void => {
  vi.stubGlobal("fetch", async () =>
    body === null
      ? new Response("", { status: 500 })
      : // Buffer 不是合法的 BodyInit，转成 Uint8Array 再喂给 Response。
        new Response(new Uint8Array(body), { status: 200 }),
  );
};

describe("company executives from the free F10 page", () => {
  it("decodes the GBK page into the three real groups", async () => {
    stubExecutives(executivesHtml());

    const result = await loadCompanyExecutives("sz300862");

    expect(result?.groups.map((group) => group.title)).toEqual([
      "公司高管",
      "历届董事会成员",
      "历届监事会成员",
    ]);
    expect(result?.groups[0]?.members).toEqual([
      {
        endedOn: null,
        name: "示例甲",
        role: "总经理",
        startedOn: "2022-01-28",
      },
    ]);
  });

  it("reads a finished term as a real end date, not as still serving", async () => {
    stubExecutives(executivesHtml());

    const result = await loadCompanyExecutives("sz300862");

    /*
     * 「--」是在任，具体日期是已卸任。两者搞反，页面就会把离任多年的人
     * 显示成现任高管——那不是排版问题，是把一条假事实写在了人名旁边。
     */
    expect(result?.groups[1]?.members[0]).toEqual({
      endedOn: "2022-01-27",
      name: "示例乙",
      role: "独立董事",
      startedOn: "2019-01-25",
    });
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("", { status: 200 });
    });

    for (const symbol of ["300862", "us:AAPL", "sz30086", ""]) {
      expect(await loadCompanyExecutives(symbol)).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when the page carries no table at all", async () => {
    stubExecutives(Buffer.from("<html><body>no tables</body></html>", "ascii"));

    // 页面结构变了就承认拿不到，不产出一份空名单假装这家公司没有高管。
    expect(await loadCompanyExecutives("sz300862")).toBeNull();
  });

  it("caches to disk and serves the cache without hitting upstream again", async () => {
    stubExecutives(executivesHtml());
    await loadCompanyExecutives("sz300862");

    const cached = JSON.parse(
      readFileSync(
        resolve(directory, "f10", "sz300862-executives.json"),
        "utf8",
      ),
    ) as { groups: readonly { members: readonly { name: string }[] }[] };
    expect(cached.groups[0]?.members[0]?.name).toBe("示例甲");

    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("", { status: 500 });
    });
    const second = await loadCompanyExecutives("sz300862");

    expect(calls).toBe(0);
    expect(second?.groups[0]?.members[0]?.name).toBe("示例甲");
  });
});

/*
 * 股权信息来自东方财富 F10 的公开 JSON 接口（免费、无需鉴权，已实测可用）：
 *   https://emweb.securities.eastmoney.com/PC_HSF10/ShareholderResearch/PageAjax?code=SZ300862
 * 一次返回股东人数、十大股东、十大流通股东、基金持股、股本结构、
 * 实际控制人、限售解禁——六个分区页共用这一份，所以只打一次接口。
 *
 * 值是照真实结构改写的合成数据，不含真实股东姓名。
 */
const SHAREHOLDER_PAYLOAD = {
  gdrs: [
    {
      AVG_FREE_SHARES: 10_548,
      AVG_HOLD_AMT: 200_533.73,
      END_DATE: "2026-07-31 00:00:00",
      HOLDER_TOTAL_NUM: 14_359,
      HOLD_FOCUS: "较集中",
      TOTAL_NUM_RATIO: 4.2623,
    },
  ],
  jjcg: [
    {
      FUND_CODE: "000000",
      HOLD_VALUE: 800_256,
      HOLDER_NAME: "示例基金",
      REPORT_DATE: "2026-06-30 00:00:00",
      TOTAL_SHARES: 38_400,
      TOTALSHARES_RATIO: 0.0208,
    },
  ],
  /*
   * 股本结构是**三分**的，不是两分——三个比例相加约等于 100%：
   *   限售流通股 17.95% + 十大流通股东持股 20.30% + 其余无限售 61.74%
   * 夹具早先漏了中间那一段，于是「三行拆分」的实现根本没被覆盖到。
   */
  ltgf: [
    {
      END_DATE: "2026-03-31 00:00:00",
      HOLD_NUM_COUNT: 37_479_934,
      HOLD_NUM_RATIO: 20.3,
      LIMITED_SHARES: 33_146_895,
      LIMITED_SHARES_RATIO: 17.95,
      OTHER_UNLIMITED_SHARES: 113_991_073,
      UNLIMITED_SHARES_RATIO: 61.74,
    },
  ],
  sdgd: [
    {
      END_DATE: "2026-07-24 00:00:00",
      HOLD_NUM: 43_593_860,
      HOLD_NUM_CHANGE: "不变",
      HOLD_NUM_RATIO: 23.61,
      HOLDER_NAME: "示例股东甲",
      HOLDER_RANK: 1,
      SHARES_TYPE: "流通A股,限售流通A股",
    },
  ],
  sdltgd: [
    {
      END_DATE: "2026-03-31 00:00:00",
      FREE_HOLDNUM_RATIO: 7.1951,
      HOLD_NUM: 10_898_465,
      HOLD_NUM_CHANGE: "451500",
      HOLDER_NAME: "示例股东甲",
      HOLDER_RANK: 1,
      HOLDER_TYPE: "个人",
    },
  ],
  sjkzr: [{ HOLD_RATIO: 23.61, HOLDER_NAME: "示例股东甲,示例股东乙" }],
  // 这只股票当前确实没有限售解禁安排——空数组是真实答案，不是失败。
  xsjj: [],
};

describe("shareholder information from the free F10 endpoint", () => {
  it("splits one payload into the six sections that need it", async () => {
    stubUpstream(SHAREHOLDER_PAYLOAD);

    const result = await loadShareholders("sz300862");

    expect(result?.holderCounts[0]).toEqual({
      averageHoldAmount: 200_533.73,
      averageShares: 10_548,
      changeRatio: 4.2623,
      endedOn: "2026-07-31",
      focus: "较集中",
      total: 14_359,
    });
    expect(result?.topHolders[0]).toEqual({
      change: "不变",
      endedOn: "2026-07-24",
      name: "示例股东甲",
      rank: 1,
      ratio: 23.61,
      shares: 43_593_860,
      sharesType: "流通A股,限售流通A股",
    });
    expect(result?.topFloatHolders[0]?.holderType).toBe("个人");
    expect(result?.fundHoldings[0]?.name).toBe("示例基金");
    expect(result?.shareStructure?.limitedShares).toBe(33_146_895);
    /*
     * 三段都要在。早先只取了 OTHER_UNLIMITED_SHARES 当作「全部无限售股」，
     * 页面上两行相加只有 79.69%，20.3% 的股本凭空消失。
     */
    expect(result?.shareStructure?.topFloatShares).toBe(37_479_934);
    const structure = result?.shareStructure;
    const total =
      (structure?.limitedRatio ?? 0) +
      (structure?.topFloatRatio ?? 0) +
      (structure?.unlimitedRatio ?? 0);
    expect(total).toBeCloseTo(100, 1);
    expect(result?.controller).toEqual({
      name: "示例股东甲,示例股东乙",
      ratio: 23.61,
    });
  });

  it("tells 'genuinely none' apart from 'could not fetch'", async () => {
    stubUpstream(SHAREHOLDER_PAYLOAD);

    const result = await loadShareholders("sz300862");

    /*
     * 上游给了 xsjj: []，意思是这只股票当前没有限售解禁安排——这是一个
     * 确定的答案。页面据此说「当前无解禁安排」；如果这里退化成 null，
     * 页面就会说「取不到」，把一件已知的事说成未知。
     */
    expect(result?.lockups).toEqual([]);
    expect(result).not.toBeNull();
  });

  it("reads the lockup rows with the field names the endpoint actually uses", async () => {
    /*
     * 这一条是补回来的。
     *
     * 蓝盾光电的 xsjj 是空数组，于是「字段名写错」在它身上完全看不出来——
     * 我第一版猜的是 FREE_DATE / FREE_SHARES_NUM / FREE_SHARES_TYPE，全错，
     * 而测试照样是绿的。真实字段名是拿一只确实有解禁安排的股票（SH688981）
     * 打接口看出来的：LIFT_DATE / LIFT_NUM / LIFT_TYPE。
     *
     * 没有这条断言，限售解禁页会渲染出一整列空值，看起来像「披露里没写」。
     */
    stubUpstream({
      ...SHAREHOLDER_PAYLOAD,
      xsjj: [
        {
          LIFT_DATE: "2027-06-23 00:00:00",
          LIFT_NUM: 547_182_073,
          LIFT_TYPE: "定向增发机构配售股份",
          TOTAL_SHARES_RATIO: 6.39,
        },
      ],
    });

    const result = await loadShareholders("sz300862");

    expect(result?.lockups).toEqual([
      {
        ratio: 6.39,
        releasedOn: "2027-06-23",
        shares: 547_182_073,
        type: "定向增发机构配售股份",
      },
    ]);
  });

  it("returns nothing when upstream fails and there is no cache", async () => {
    stubUpstream(null, 500);

    expect(await loadShareholders("sz300862")).toBeNull();
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const symbol of ["300862", "sz30086", "", "us:AAPL"]) {
      expect(await loadShareholders(symbol)).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("ignores a cache written before the shape changed", async () => {
    /*
     * 真实踩过的坑，而且踩了两次。
     *
     * 给 shareStructure 加了 topFloatShares / topFloatRatio 之后，磁盘上那些
     * **加字段之前**写下的缓存在 12 小时 TTL 内仍被判定为「新鲜」，于是旧结构
     * 被原样回灌到页面——股本结构三行相加只有 79.69%，20.3% 的股本凭空消失，
     * 而页面看起来完全正常，没有报错、没有空白。
     *
     * 第一次我只让格式化函数容忍了 undefined：页面不崩了，但数据依然是缺的。
     * 真正的修法是给缓存打版本号：结构变过就当没有缓存。
     */
    mkdirSync(resolve(directory, "f10"), { recursive: true });
    writeFileSync(
      resolve(directory, "f10", "sz300862-shareholders.json"),
      JSON.stringify({
        // 老格式：没有 schema，也没有 topFloatShares / topFloatRatio。
        fetchedAt: new Date().toISOString(),
        fundHoldings: [],
        holderCounts: [],
        lockups: [],
        shareStructure: {
          endedOn: "2026-03-31",
          limitedRatio: 17.95,
          limitedShares: 33_146_895,
          unlimitedRatio: 61.74,
          unlimitedShares: 113_991_073,
        },
        symbol: "sz300862",
        topFloatHolders: [],
        topHolders: [],
      }),
      "utf8",
    );

    stubUpstream(SHAREHOLDER_PAYLOAD);
    const result = await loadShareholders("sz300862");

    // 版本不符就重新取，拿到的是带完整字段的新结构。
    expect(result?.shareStructure?.topFloatShares).toBe(37_479_934);
    expect(result?.shareStructure?.topFloatRatio).toBe(20.3);
  });

  it("caches to disk so six section pages share one upstream call", async () => {
    stubUpstream(SHAREHOLDER_PAYLOAD);
    await loadShareholders("sz300862");

    const cached = JSON.parse(
      readFileSync(
        resolve(directory, "f10", "sz300862-shareholders.json"),
        "utf8",
      ),
    ) as { topHolders: readonly { name: string }[] };
    expect(cached.topHolders[0]?.name).toBe("示例股东甲");

    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("", { status: 500 });
    });
    const second = await loadShareholders("sz300862");

    expect(calls).toBe(0);
    expect(second?.topHolders[0]?.name).toBe("示例股东甲");
  });
});

/*
 * 高管增减持来自东方财富数据中心的公开接口（免费、无需鉴权，已实测可用）：
 *   https://datacenter-web.eastmoney.com/api/data/v1/get
 *     ?reportName=RPT_EXECUTIVE_HOLD_DETAILS&filter=(SECURITY_CODE="300862")
 *
 * 值是照真实结构改写的合成数据，不含真实高管姓名。
 */
const INSIDER_PAYLOAD = {
  result: {
    data: [
      {
        AVERAGE_PRICE: 24.81,
        CHANGE_AMOUNT: -2_034_420,
        CHANGE_DATE: "2025-08-20 00:00:00",
        CHANGE_RATIO: 0.0444,
        CHANGE_REASON: "大宗交易",
        // 负数是减持。这一个符号就是「减持」和「增持」的全部区别。
        CHANGE_SHARES: -82_000,
        END_HOLD_NUM: 43_593_800,
        PERSON_DSE_RELATION: "本人",
        PERSON_NAME: "示例董事",
        POSITION_NAME: "董事",
      },
    ],
  },
};

describe("insider trades from the free data-centre endpoint", () => {
  it("keeps the sign that separates a sale from a purchase", async () => {
    stubUpstream(INSIDER_PAYLOAD);

    const result = await loadInsiderTrades("sz300862");

    expect(result?.trades[0]).toEqual({
      amount: -2_034_420,
      averagePrice: 24.81,
      changedOn: "2025-08-20",
      heldAfter: 43_593_800,
      name: "示例董事",
      position: "董事",
      ratio: 0.0444,
      reason: "大宗交易",
      relation: "本人",
      shares: -82_000,
    });
    /*
     * 取绝对值会把减持渲染成增持。这不是显示问题——那是在人名旁边写一件
     * 与披露相反的事。
     */
    expect(result?.trades[0]?.shares).toBeLessThan(0);
  });

  it("treats an empty list as 'no disclosed changes', not as a failure", async () => {
    stubUpstream({ result: { data: [] } });

    const result = await loadInsiderTrades("sz300862");

    expect(result?.trades).toEqual([]);
    expect(result).not.toBeNull();
  });

  it("refuses a symbol shape it does not recognise", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    });

    for (const symbol of ["300862", "sz30086", "", "us:AAPL"]) {
      expect(await loadInsiderTrades(symbol)).toBeNull();
    }
    expect(calls).toBe(0);
  });

  it("returns nothing when upstream fails and there is no cache", async () => {
    stubUpstream(null, 500);

    expect(await loadInsiderTrades("sz300862")).toBeNull();
  });
});
