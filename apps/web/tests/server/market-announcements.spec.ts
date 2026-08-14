import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_ANNOUNCEMENT_ROWS,
  loadMarketAnnouncements,
} from "../../src/server/market-announcements.server";

/*
 * 全市场 A 股公告，来自巨潮资讯（证监会指定的信息披露网站）。
 *
 * 7×24 那一页的下半部分原先挂的是 SEC EDGAR 的美股申报快照——数据是真的，
 * 但两件事不对：一是它是本地快照，最新一条常常停在两天前；二是这是个
 * 雪球复刻站，A 股站的「官方申报」栏目列美股申报，本身就不对题。
 *
 * 注意与 company-ops.server.ts 里那个 loadAnnouncements 区分：那个是**按标的**
 * 查（个股详情页的公告页签，走东财），这里是**全市场**流，走巨潮。
 *
 * 四个坑：
 *   1. 查询走 POST + form 编码，不是 JSON。发 JSON 不报错，会被当成空查询；
 *   2. `announcementTime` 是毫秒时间戳，不是字符串；
 *   3. `adjunctUrl` 是相对路径（finalpage/2026-08-14/xxx.PDF），要拼上
 *      static.cninfo.com.cn 才打得开；
 *   4. 标题里带 <em> 高亮标签，要去掉，否则页面上出现一串尖括号。
 *
 * 值是照真实结构改写的合成数据。
 */

const rowOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  adjunctUrl: "finalpage/2026-08-14/1225472994.PDF",
  announcementId: "1225472994",
  announcementTime: 1_786_636_800_000,
  announcementTitle: "示例股份有限公司关于监管措施的公告",
  secCode: "600000",
  secName: "示例股份",
  ...overrides,
});

const bodyOf = (rows: readonly unknown[], total = 354_149): string =>
  JSON.stringify({ announcements: rows, totalAnnouncement: total });

let requested = "";
let lastInit: RequestInit | undefined;

const stubUpstream = (body: string | null): void => {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    requested = String(input);
    lastInit = init;
    if (body === null) return new Response("", { status: 500 });
    return new Response(body, { status: 200 });
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  requested = "";
  lastInit = undefined;
});

describe("asking cninfo for announcements", () => {
  it("posts a form, not JSON", async () => {
    stubUpstream(bodyOf([rowOf()]));

    await loadMarketAnnouncements();

    /*
     * 这个接口只认 application/x-www-form-urlencoded。发 JSON 不会报错，
     * 它会当成一次空查询照常回 200——回来的内容看起来完全正常。
     */
    expect(lastInit?.method).toBe("POST");
    expect(
      (lastInit?.headers as Record<string, string> | undefined)?.[
        "Content-Type"
      ],
    ).toBe("application/x-www-form-urlencoded");
    expect(String(lastInit?.body)).toContain("tabName=fulltext");
    expect(requested).toContain("cninfo.com.cn");
  });

  it("clamps how many rows a caller can ask for", async () => {
    stubUpstream(bodyOf([rowOf()]));

    await loadMarketAnnouncements(100_000);

    expect(String(lastInit?.body)).toContain(
      `pageSize=${String(MAX_ANNOUNCEMENT_ROWS)}`,
    );
  });
});

describe("reading one announcement", () => {
  it("builds a link that actually opens the filing", async () => {
    stubUpstream(
      bodyOf([rowOf({ adjunctUrl: "finalpage/2026-08-14/1225472994.PDF" })]),
    );

    const page = await loadMarketAnnouncements();

    // 上游给的是相对路径，不拼主机就是一串打不开的链接。
    expect(page?.rows[0]?.href).toBe(
      "https://static.cninfo.com.cn/finalpage/2026-08-14/1225472994.PDF",
    );
  });

  it("reads the epoch timestamp as a Beijing date", async () => {
    // 1786636800000 是北京时间 2026-08-14 的零点。
    stubUpstream(bodyOf([rowOf({ announcementTime: 1_786_636_800_000 })]));

    const page = await loadMarketAnnouncements();

    expect(page?.rows[0]?.publishedOn).toBe("2026-08-14");
  });

  it("strips the highlight markup out of the title", async () => {
    stubUpstream(
      bodyOf([
        rowOf({
          announcementTitle: "示例股份有限公司关于<em>监管措施</em>的公告",
        }),
      ]),
    );

    const page = await loadMarketAnnouncements();

    /*
     * 接口带 isHLtitle，命中的关键词会被 <em> 包起来。原样渲染就是一串
     * 尖括号出现在标题里；交给 dangerouslySetInnerHTML 又是把上游内容
     * 当 HTML 执行。所以在取数层就去掉。
     */
    expect(page?.rows[0]?.title).toBe("示例股份有限公司关于监管措施的公告");
    expect(page?.rows[0]?.title).not.toContain("<");
  });

  it("links the stock to its page on this site when it can", async () => {
    stubUpstream(
      bodyOf([
        rowOf({ secCode: "600000", secName: "沪市样例" }),
        rowOf({
          announcementId: "2",
          secCode: "920187",
          secName: "北交所样例",
        }),
      ]),
    );

    const page = await loadMarketAnnouncements();

    expect(page?.rows[0]?.symbolHref).toBe("/instruments/sh600000");
    // 北交所站内渲染不出来：给了链接就是点进去 404。
    expect(page?.rows[1]?.symbolHref).toBeNull();
  });

  it("cannot be pointed at another host by the upstream field", async () => {
    /*
     * adjunctUrl 来自上游，是这里唯一进入链接的外部字符串。上游被改、被劫持、
     * 或哪天自己改了格式，都不该让页面上出现一个指向别处的链接——更不该
     * 出现 javascript: 这种协议。主机是写死的常量，这一条把它钉住。
     */
    for (const hostile of [
      "//evil.example.com/x.pdf",
      "https://evil.example.com/x.pdf",
      "javascript:alert(1)",
      "../../../etc/passwd",
      "finalpage/../../x.PDF",
    ]) {
      stubUpstream(bodyOf([rowOf({ adjunctUrl: hostile })]));
      // 形状不对就整条丢掉，不拼出一个似是而非的地址。
      expect(await loadMarketAnnouncements(), hostile).toBeNull();
    }

    // 正常的相对路径照常拼在固定主机上。
    stubUpstream(bodyOf([rowOf({ adjunctUrl: "finalpage/2026-08-14/1.PDF" })]));
    const page = await loadMarketAnnouncements();
    expect(new URL(page?.rows[0]?.href ?? "").origin).toBe(
      "https://static.cninfo.com.cn",
    );
  });

  it("drops a row with no title or no file", async () => {
    stubUpstream(
      bodyOf([
        rowOf(),
        rowOf({ announcementId: "2", announcementTitle: "" }),
        rowOf({ adjunctUrl: "", announcementId: "3" }),
      ]),
    );

    expect((await loadMarketAnnouncements())?.rows).toHaveLength(1);
  });

  it("returns nothing when upstream fails or gives an empty page", async () => {
    stubUpstream(null);
    expect(await loadMarketAnnouncements()).toBeNull();

    // 空列表会被读成「今天没有公告」，那是另一回事。
    stubUpstream(bodyOf([]));
    expect(await loadMarketAnnouncements()).toBeNull();

    stubUpstream(JSON.stringify({ announcements: null }));
    expect(await loadMarketAnnouncements()).toBeNull();
  });
});
