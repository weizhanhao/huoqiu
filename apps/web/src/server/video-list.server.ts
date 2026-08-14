/*
 * 视频频道的取数。
 *
 * 这一页此前六条全是编的：标题、作者、时长、播放量没有一样是真的，
 * 封面是本地渐变，栏目分类（复盘 / 方法 / 数据 / 访谈）也是我自己想的。
 *
 * 现在列的是东方财富公开视频列表里的真实条目，栏目用它自己的四个
 * （热点小视频、财富大咖秀、公司路演、投教动画），点开是它自己的播放页。
 *
 * 上游**没有**时长、播放量、作者，所以这里一个都不给——页面编不出来，
 * 就不会再出现「1.9 万次播放」这种数字。
 */

const ORIGIN = "https://video.eastmoney.com";
const PATH = "/api/videodata/GetNewsList";
/** 列表页给的 /news/1<栏目>,<编号>.html 会 302 到这里，直接用终点。 */
const ARTICLE_BASE = "https://finance.eastmoney.com/a/";

/*
 * 封面图只可能来自这一个地方。三十条抽样全部是这个主机、这个前缀。
 */
const THUMBNAIL_ORIGIN = "https://np-newspic.dfcfw.com";
const THUMBNAIL_PREFIX = "/download/";
/*
 * 允许的文件名形状。收得很紧是有原因的：封面经本站转发，这个名字最终会
 * 变成一次服务端发起的请求。放宽到「随便什么字符串」，这个接口就是一个
 * 替人访问任意地址的跳板——内网地址、云元数据服务、别人的站点，
 * 攻击者只需要改一个查询参数。
 *
 * 不收 .svg：SVG 可以带脚本，而它会从本站域名下发出去。
 */
const THUMBNAIL_NAME = /^[A-Za-z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/u;

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1024 * 1024;

/** 一次最多列这么多条。 */
export const MAX_VIDEO_ROWS = 30;

export type VideoItem = Readonly<{
  code: string;
  /** 上游自己的栏目名，例如「热点小视频」。 */
  column: string | null;
  /** 站外播放页。 */
  href: string;
  /** 北京时间墙钟，YYYY-MM-DD HH:MM。 */
  publishedAt: string | null;
  /** 封面文件名；经本站转发，浏览器不直连第三方。 */
  thumbnail: string | null;
  title: string;
}>;

export type VideoList = Readonly<{ videos: readonly VideoItem[] }>;

const textOf = (raw: unknown): string | null =>
  typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

/**
 * 从上游封面地址里取出文件名；不是那个已知位置的图就返回 null。
 *
 * 用 URL 解析而不是字符串前缀匹配：
 * `https://evil.example.com/?x=https://np-newspic.dfcfw.com/download/a.jpg`
 * 这种串是能骗过 startsWith 的。
 */
export const thumbnailNameOf = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.origin !== THUMBNAIL_ORIGIN) return null;
  if (parsed.search.length > 0 || parsed.hash.length > 0) return null;
  if (!parsed.pathname.startsWith(THUMBNAIL_PREFIX)) return null;
  const name = parsed.pathname.slice(THUMBNAIL_PREFIX.length);
  // 路径里再有一层斜杠就不是我们认识的那种地址了。
  if (name.includes("/") || !THUMBNAIL_NAME.test(name)) return null;
  return name;
};

/**
 * 由文件名还原上游地址；名字不合法就返回 null。
 *
 * 转发路由拿到的名字来自查询串，同样要过这一关——校验只做在入口一侧，
 * 等于没做。
 */
export const thumbnailUrlOf = (name: unknown): string | null => {
  if (typeof name !== "string" || !THUMBNAIL_NAME.test(name)) return null;
  return `${THUMBNAIL_ORIGIN}${THUMBNAIL_PREFIX}${name}`;
};

/**
 * `2026-08-13 21:03:16` → `2026-08-13 21:03`。
 *
 * 刻意不做任何时区换算：上游给的是北京时间的墙钟，不带时区。交给
 * `new Date(...)` 再格式化，在 UTC 机器上会整体前移八小时——晚上 21:03
 * 发的视频显示成下午 13:03，而那仍然是个像模像样的时间，看不出错。
 */
const publishedAtOf = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const matched = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})?$/u.exec(
    raw.trim(),
  );
  return matched === null ? null : `${matched[1]} ${matched[2]}`;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Referer: `${ORIGIN}/`,
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
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 最新的公开财经视频；上游取不到时返回 null。
 *
 * 返回 null 而不是空数组：空数组会让页面显示成「今天没有视频」，
 * 那是另一回事。
 */
export const loadVideos = async (
  rows: number = MAX_VIDEO_ROWS,
): Promise<VideoList | null> => {
  const size =
    Number.isInteger(rows) && rows >= 1
      ? Math.min(rows, MAX_VIDEO_ROWS)
      : MAX_VIDEO_ROWS;

  const payload = await fetchJson(
    `${ORIGIN}${PATH}?pagesize=${String(size)}&pageno=1&column=0`,
  );
  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as Record<string, unknown>;
  // 上游用 IsSuccess 表示成败；为 false 时 List 可能还在，但那份不作数。
  if (record.IsSuccess !== true) return null;
  if (!Array.isArray(record.List)) return null;

  const videos: VideoItem[] = [];
  for (const entry of record.List) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const code = textOf(row.Code);
    const title = textOf(row.Title);
    // 没有编号就点不开，没有标题就不知道是什么——两者缺一都不值得列。
    if (code === null || title === null) continue;
    if (!/^\d{6,}$/u.test(code)) continue;

    videos.push({
      code,
      column: textOf(row.ColumnName),
      href: `${ARTICLE_BASE}${code}.html`,
      publishedAt: publishedAtOf(row.ShowTime),
      thumbnail: thumbnailNameOf(row.Img),
      title,
    });
  }

  if (videos.length === 0) return null;
  return { videos };
};
