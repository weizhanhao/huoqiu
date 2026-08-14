/*
 * 相关股票。
 *
 * 雪球个股页右栏有一块「相关股票」，列的是同行业的几只，带实时涨跌。
 * 站内此前整条右栏都没有。
 *
 * 「相关」得有个说法。这里用的是上游给的所属板块（f198，长鑫科技是
 * BK1036 半导体），再按板块拉成分股——不是按名字像不像，也不是随手
 * 挑几只热门的凑数。板块取不到（港美股、指数）就整块不给：随便列几只
 * 热门股当「相关」，那是编造关联。
 */

const ORIGIN = "https://push2.eastmoney.com";
/** 有些网络环境到 push2 不通，延时源仍可用。 */
const DELAYED_ORIGIN = "https://push2delay.eastmoney.com";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 256 * 1024;

/** 右栏那一小块放得下几条。多了就把下面的内容挤没了。 */
const PEER_COUNT = 6;

export type SectorPeer = Readonly<{
  changePercent: number | null;
  last: number | null;
  name: string;
  symbol: string;
}>;

export type SectorPeers = Readonly<{
  peers: readonly SectorPeer[];
  sectorCode: string;
  sectorName: string;
}>;

const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchJson = async (path: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const attempt = async (origin: string): Promise<unknown> => {
    const response = await fetch(`${origin}${path}`, {
      headers: {
        Referer: "https://quote.eastmoney.com/",
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
    // 空 body 是限流时的表现，不是「没有这个板块」。
    if (text.trim().length === 0) return null;
    return JSON.parse(text) as unknown;
  };

  /*
   * 每一路各自兜住异常。
   *
   * 主源会突然掐断连接（UND_ERR_SOCKET），fetch 是直接抛，不是回一个错误码。
   * 两路套在同一个 try 里，主源一抛就跳到 catch——延时源永远轮不到，
   * 而代码读起来像是有回退的。
   */
  const tryOne = async (origin: string): Promise<unknown> => {
    try {
      return await attempt(origin);
    } catch {
      return null;
    }
  };

  try {
    return (await tryOne(ORIGIN)) ?? (await tryOne(DELAYED_ORIGIN));
  } finally {
    clearTimeout(timer);
  }
};

const dataOf = (payload: unknown): Record<string, unknown> | null => {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  return data as Record<string, unknown>;
};

/** f13：1 是沪市，0 是深市。贴反了会指向另一只股票。 */
const symbolOf = (code: unknown, market: unknown): string | null => {
  if (typeof code !== "string" || !/^\d{6}$/u.test(code)) return null;
  if (market !== 0 && market !== 1) return null;
  return `${market === 1 ? "sh" : "sz"}${code}`;
};

/**
 * 同板块的几只股票；板块取不到或上游失败时返回 null。
 */
export const loadSectorPeers = async (
  rawSymbol: string,
): Promise<SectorPeers | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!/^(?:sh|sz)\d{6}$/u.test(symbol)) return null;

  const secid = `${symbol.startsWith("sh") ? "1" : "0"}.${symbol.slice(2)}`;
  const sector = dataOf(
    await fetchJson(
      `/api/qt/stock/get?secid=${secid}&fltt=2&fields=f57,f58,f127,f198`,
    ),
  );
  if (sector === null) return null;

  const sectorCode = typeof sector.f198 === "string" ? sector.f198.trim() : "";
  const sectorName = typeof sector.f127 === "string" ? sector.f127.trim() : "";
  /*
   * 没有板块就到此为止，不再去问成分股。港美股和指数走的就是这条路——
   * 白发一次请求事小，拿回一堆不相干的股票当「相关」事大。
   */
  if (sectorCode.length === 0 || sectorName.length === 0) return null;

  const list = dataOf(
    await fetchJson(
      `/api/qt/clist/get?pn=1&pz=${String(PEER_COUNT + 1)}&po=1&np=1` +
        `&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f12,f13,f14`,
    ),
  );
  if (list === null) return null;
  const diff = list.diff;
  if (!Array.isArray(diff)) return null;

  const peers: SectorPeer[] = [];
  for (const entry of diff) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const peerSymbol = symbolOf(row.f12, row.f13);
    const name = typeof row.f14 === "string" ? row.f14.trim() : "";
    if (peerSymbol === null || name.length === 0) continue;
    /*
     * 成分股里必然包含它自己。不剔掉的话，「相关股票」第一条就是当前
     * 这只——占掉一格，还让人以为点错了页面。
     */
    if (peerSymbol === symbol) continue;
    peers.push({
      changePercent: numeric(row.f3),
      last: numeric(row.f2),
      name,
      symbol: peerSymbol,
    });
    if (peers.length === PEER_COUNT) break;
  }

  if (peers.length === 0) return null;
  return { peers, sectorCode, sectorName };
};
