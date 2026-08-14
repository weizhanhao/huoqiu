import { classifySymbol } from "../lib/symbol-category";

/*
 * 全市场 A 股公告，来自巨潮资讯——证监会指定的信息披露网站，公告是原件。
 *
 * 7×24 那一页的下半部分原先挂的是 SEC EDGAR 的美股申报快照。数据是真的，
 * 但两件事不对：
 *   1. 它是本地快照，靠一个需要 SEC 可联系身份的脚本刷新，实际最新一条
 *      常常停在两天前——一个叫 7×24 的栏目，内容两天没动过；
 *   2. 这是雪球复刻站。A 股站的「官方申报」栏目列美股申报，不对题。
 *
 * 巨潮这个接口不需要任何身份，公告是分钟级的。
 *
 * 与 company-ops.server.ts:609 的 loadAnnouncements 区分：那个必须传标的代码
 * （个股详情页的公告页签，走东财），这里是全市场流，无入参。
 */

const ORIGIN = "https://www.cninfo.com.cn";
const PATH = "/new/hisAnnouncement/query";
/** 公告原件在这个静态站上，adjunctUrl 是相对它的路径。 */
const FILE_ORIGIN = "https://static.cninfo.com.cn";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** 一次最多列这么多条。全市场累计三十多万条，没人会翻到底。 */
export const MAX_ANNOUNCEMENT_ROWS = 30;

export type MarketAnnouncement = Readonly<{
  code: string;
  /** 公告原件（PDF）。 */
  href: string;
  name: string;
  /** 披露日期，YYYY-MM-DD（北京时间）。 */
  publishedOn: string | null;
  /** 站内标的页；站内渲染不出来的为 null。 */
  symbolHref: string | null;
  title: string;
}>;

export type MarketAnnouncements = Readonly<{
  rows: readonly MarketAnnouncement[];
  /** 上游报告的公告总数。 */
  total: number | null;
}>;

const textOf = (raw: unknown): string | null =>
  typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

/**
 * 公告原件的相对路径。
 *
 * 主机是写死的常量，所以调用方本来就改不了它。但 adjunctUrl 是这条链路上
 * 唯一进入链接的外部字符串，上游要是给了 `//evil.example.com/x.pdf`，拼出来
 * 虽然仍在 static.cninfo.com.cn 上，却是一条毫无意义、指向别人域名同名路径的
 * 地址。与其让它拼出来，不如在边界上直接不认。
 *
 * 只收「若干段普通路径 + 文件名」，不收协议、不收 //、不收 ..。
 */
const FILE_PATH = /^[A-Za-z0-9_\-./]+$/u;

const filePathOf = (raw: unknown): string | null => {
  const original = textOf(raw);
  if (original === null) return null;
  /*
   * 先看原样，再剥前导斜杠——顺序反了就等于把证据抹掉：`//evil.example.com/x.pdf`
   * 剥完变成 `evil.example.com/x.pdf`，一个再普通不过的相对路径，什么也检查不出来。
   */
  if (original.includes("//") || original.includes("..")) return null;
  const file = original.replace(/^\/+/u, "");
  if (file.length === 0 || !FILE_PATH.test(file)) return null;
  return file;
};

/**
 * 去掉标题里的高亮标签。
 *
 * 接口带 isHLtitle，命中的关键词会被 `<em>` 包起来。原样渲染就是一串尖括号
 * 出现在标题里；交给 dangerouslySetInnerHTML 又等于把上游内容当 HTML 执行。
 * 所以在取数层就剥掉——页面拿到的永远是纯文本。
 */
const plainTitleOf = (raw: unknown): string | null => {
  const title = textOf(raw);
  if (title === null) return null;
  const stripped = title.replace(/<[^>]*>/gu, "").trim();
  return stripped.length === 0 ? null : stripped;
};

/**
 * 毫秒时间戳 → 北京时间的 `YYYY-MM-DD`。
 *
 * 披露日期按交易所所在时区算。用本机时区格式化，服务端跑在 UTC 上时
 * 会把当天零点披露的公告显示成前一天。
 */
const publishedOnOf = (raw: unknown): string | null => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const at = new Date(raw + 8 * 60 * 60 * 1000);
  if (Number.isNaN(at.getTime())) return null;
  return at.toISOString().slice(0, 10);
};

const fetchJson = async (body: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ORIGIN}${PATH}`, {
      body,
      headers: {
        // 这个接口只认 form 编码。发 JSON 会被当成一次空查询，且照常回 200。
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${ORIGIN}/new/commonUrl?url=disclosure/list/notice`,
        "User-Agent": "Mozilla/5.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (reader === undefined) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 最新的全市场公告；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天没有公告」，
 * 那是另一回事。
 */
export const loadMarketAnnouncements = async (
  rows: number = MAX_ANNOUNCEMENT_ROWS,
): Promise<MarketAnnouncements | null> => {
  const size =
    Number.isInteger(rows) && rows >= 1
      ? Math.min(rows, MAX_ANNOUNCEMENT_ROWS)
      : MAX_ANNOUNCEMENT_ROWS;

  const payload = await fetchJson(
    new URLSearchParams({
      column: "szse",
      isHLtitle: "true",
      pageNum: "1",
      pageSize: String(size),
      tabName: "fulltext",
    }).toString(),
  );
  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.announcements)) return null;

  const parsed: MarketAnnouncement[] = [];
  for (const entry of record.announcements) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const title = plainTitleOf(row.announcementTitle);
    const file = filePathOf(row.adjunctUrl);
    // 没标题不知道是什么，没原件就点不开——两者缺一都不值得列。
    if (title === null || file === null) continue;

    const code = textOf(row.secCode) ?? "";
    /*
     * 站内认不认这个代码，以 classifySymbol 为准。北交所的票也会出现在
     * 公告里，而站内渲染不出来——照样给链接的话，点得进去、点进去是 404。
     */
    const symbol = `${code.startsWith("6") ? "sh" : "sz"}${code}`;
    const symbolHref =
      /^\d{6}$/u.test(code) && classifySymbol(symbol) !== "other"
        ? `/instruments/${symbol}`
        : null;

    parsed.push({
      code,
      href: `${FILE_ORIGIN}/${file}`,
      name: textOf(row.secName) ?? "",
      publishedOn: publishedOnOf(row.announcementTime),
      symbolHref,
      title,
    });
  }

  if (parsed.length === 0) return null;

  const total = record.totalAnnouncement;
  return {
    rows: parsed,
    total: typeof total === "number" && Number.isFinite(total) ? total : null,
  };
};
