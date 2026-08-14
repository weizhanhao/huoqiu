/*
 * 7×24 快讯。
 *
 * 这一栏此前只有 SEC EDGAR 的美股申报，而且是本地快照：最新一条停在两天前，
 * 页面上老实标着「已陈旧」。一个叫 7×24 的栏目，内容两天没动过。
 * （那份快照仍然保留，它是另一回事：官方申报原件。刷新它需要 SEC 要求的
 * 可联系身份，见 scripts/fetch-finance-public.ts。）
 *
 * 这里接的是东方财富公开快讯列表，分钟级的中文市场快讯。
 *
 * 三个坑：
 *   1. 响应不是 JSON，是 `var ajaxResult={...};` 这么一句 JS 赋值；
 *   2. 成功标志是 rc:1。行情那几个接口是 rc:0 表示成功，正好相反；
 *   3. 时间是北京时间墙钟，不带时区。
 */

const ORIGIN = "https://newsapi.eastmoney.com";
/** 栏目 102 是「全部快讯」。路径里依次是 栏目_回调名_每页_页码。 */
const COLUMN = "102";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** 一次最多取这么多条。 */
export const MAX_LIVE_NEWS_ROWS = 50;

export type LiveNewsItem = Readonly<{
  /** 一句话摘要；与标题重复时为 null。 */
  digest: string | null;
  href: string;
  id: string;
  /** 北京时间墙钟，YYYY-MM-DD HH:MM。 */
  publishedAt: string | null;
  title: string;
}>;

export type LiveNewsFeed = Readonly<{ items: readonly LiveNewsItem[] }>;

const textOf = (raw: unknown): string | null =>
  typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

/**
 * 剥掉上游可能带的标签，只留纯文本。
 *
 * 公告那一路（market-announcements.server.ts）本来就这么做——它的接口带
 * isHLtitle，命中的关键词会被 `<em>` 包起来。快讯这一路原先不剥：同一个站里
 * 两套上游、两种净化策略，是迟早要出事的那种不一致。
 *
 * React 默认转义，所以今天不至于是 XSS；但页面上会出现一串尖括号，而且哪天
 * 有人在下游用了 dangerouslySetInnerHTML，这里就是入口。净化放在取数层，
 * 页面拿到的永远是纯文本。
 */
const plainTextOf = (raw: unknown): string | null => {
  const value = textOf(raw);
  if (value === null) return null;
  const stripped = value.replace(/<[^>]*>/gu, "").trim();
  return stripped.length === 0 ? null : stripped;
};

/**
 * `2026-08-14 00:08:19` → `2026-08-14 00:08`。
 *
 * 不做时区换算：上游给的是北京时间的墙钟。交给 `new Date(...)` 再格式化，
 * 在 UTC 机器上会整体前移八小时——凌晨 00:08 的快讯显示成前一天 16:08，
 * 而那仍然是个像模像样的时间，看不出错。
 */
const publishedAtOf = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const matched = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})?$/u.exec(
    raw.trim(),
  );
  return matched === null ? null : `${matched[1]} ${matched[2]}`;
};

/**
 * 上游给的是 http。本站是 https，照抄会被浏览器当混合内容拦掉——
 * 每一条快讯都点不开，而页面本身看不出任何异样。
 */
const hrefOf = (raw: unknown): string | null => {
  const url = textOf(raw);
  if (url === null) return null;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) {
    return `https://${url.slice("http://".length)}`;
  }
  return null;
};

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "https://kuaixun.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
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
    return text.trim().length === 0 ? null : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 最新的公开财经快讯；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天没有快讯」，
 * 那是另一回事。
 */
export const loadLiveNews = async (
  rows: number = MAX_LIVE_NEWS_ROWS,
): Promise<LiveNewsFeed | null> => {
  const size =
    Number.isInteger(rows) && rows >= 1
      ? Math.min(rows, MAX_LIVE_NEWS_ROWS)
      : MAX_LIVE_NEWS_ROWS;

  const body = await fetchText(
    `${ORIGIN}/kuaixun/v1/getlist_${COLUMN}_ajaxResult_${String(size)}_1_.html`,
  );
  if (body === null) return null;

  /*
   * 响应是 `var ajaxResult={...};`，不是 JSON。直接 JSON.parse 整个响应会抛，
   * 而抛在 catch 里就变成了「今天没有快讯」——一个空栏目，没有任何报错。
   */
  const matched = /var\s+ajaxResult\s*=\s*(\{[\s\S]*\})\s*;?\s*$/u.exec(
    body.trim(),
  );
  if (matched === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(matched[1] ?? "") as unknown;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as Record<string, unknown>;
  // rc:1 才是成功。行情那几个接口是 rc:0 成功，正好反过来。
  if (record.rc !== 1) return null;
  if (!Array.isArray(record.LivesList)) return null;

  const items: LiveNewsItem[] = [];
  const seen = new Set<string>();
  for (const entry of record.LivesList) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = textOf(row.id);
    const title = plainTextOf(row.title);
    const href = hrefOf(row.url_w);
    // 没标题就不知道是什么，没链接就点不开——两者缺一都不值得列。
    if (id === null || title === null || href === null) continue;
    // 同一条出现两次，读起来像是又发生了一次。
    if (seen.has(id)) continue;
    seen.add(id);

    const digest = plainTextOf(row.digest);
    items.push({
      // 摘要跟标题一模一样时不重复显示。
      digest:
        digest === null || digest.replace(/。$/u, "") === title ? null : digest,
      href,
      id,
      publishedAt: publishedAtOf(row.showtime),
      title,
    });
  }

  if (items.length === 0) return null;
  return { items };
};
