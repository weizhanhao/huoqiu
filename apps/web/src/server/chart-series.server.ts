/*
 * 图表的各个周期。
 *
 * 雪球图上方有一排：分时 / 五日 / 日K / 周K / 月K / 年K / 120分…1分。
 * 站内此前只有一张日 K，切都切不了。
 *
 * 全部走腾讯。东财那两个源（push2 / push2his）在服务端会成片断连——
 * 同一分钟内 curl 通、Node 挂，压测 20 次只成 1 次；腾讯那条 20/20 全过。
 * 日 K 早先就是为这个换掉的，这里沿用同一个源。
 *
 * 分时与日周月 K 在 web.ifzq.gtimg.cn，分钟 K 在 ifzq.gtimg.cn——
 * 两个域名，弄混了会得到 ENOTFOUND。
 */

const WEB_ORIGIN = "https://web.ifzq.gtimg.cn";
const MINUTE_ORIGIN = "https://ifzq.gtimg.cn";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;

/** 一手 100 股。沪深的成交量按手给，港美股按股。 */
const SHARES_PER_LOT = 100;

/** 一次最多取多少根，够铺满一屏还能左右看。 */
const BAR_LIMIT = 320;

export type ChartPeriod =
  | "5day"
  | "day"
  | "intraday"
  | "m1"
  | "m5"
  | "m15"
  | "m30"
  | "m60"
  | "m120"
  | "month"
  | "quarter"
  | "week"
  | "year";

/*
 * 每个周期在上游的字段名。
 *
 * 各不相同（qfqday / qfqweek / qfqmonth / year / m60…）。拿错一个，得到的
 * 是空数组——图是空的，但请求成功、页面不报错。
 */
const CANDLE_PERIODS = {
  day: { field: "qfqday", param: "day" },
  m1: { field: "m1", param: "m1" },
  m5: { field: "m5", param: "m5" },
  m15: { field: "m15", param: "m15" },
  m30: { field: "m30", param: "m30" },
  m60: { field: "m60", param: "m60" },
  m120: { field: "m120", param: "m120" },
  month: { field: "qfqmonth", param: "month" },
  quarter: { field: "qfqmonth", param: "month" },
  week: { field: "qfqweek", param: "week" },
  year: { field: "year", param: "year" },
} as const;

const MINUTE_PERIODS = new Set(["m1", "m5", "m15", "m30", "m60", "m120"]);

export const CHART_PERIODS: readonly Readonly<{
  id: ChartPeriod;
  label: string;
}>[] = [
  { id: "intraday", label: "分时" },
  { id: "5day", label: "五日" },
  { id: "day", label: "日K" },
  { id: "week", label: "周K" },
  { id: "month", label: "月K" },
  { id: "quarter", label: "季K" },
  { id: "year", label: "年K" },
  { id: "m120", label: "120分" },
  { id: "m60", label: "60分" },
  { id: "m30", label: "30分" },
  { id: "m15", label: "15分" },
  { id: "m5", label: "5分" },
  { id: "m1", label: "1分" },
];

export const isChartPeriod = (value: string): value is ChartPeriod =>
  CHART_PERIODS.some((entry) => entry.id === value);

export type LinePoint = Readonly<{
  /** 累计成交额 ÷ 累计成交股数，不是各分钟价格的平均。 */
  averagePrice: number;
  price: number;
  /** HH:mm。 */
  time: string;
  volumeShares: number;
}>;

export type CandleBar = Readonly<{
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volumeShares: number;
}>;

export type ChartSeries =
  | Readonly<{
      bars: readonly CandleBar[];
      kind: "candle";
      period: ChartPeriod;
      previousClose: number | null;
      symbol: string;
    }>
  | Readonly<{
      kind: "line";
      period: ChartPeriod;
      points: readonly LinePoint[];
      previousClose: number | null;
      symbol: string;
    }>;

/*
 * 站内代码 → 腾讯代码。
 *
 * 美股这里返回 null：腾讯要求带交易所后缀（.OQ/.N），而后缀要先问报价
 * 才知道。给个错后缀，腾讯不报错，只把字段从 qfqday 换成 day，内容是
 * 十几年前的——图画得出来、形状也正常，就是差了十五年。
 */
const tencentCodeOf = (symbol: string): string | null => {
  const code = symbol.slice(2);
  if (symbol.startsWith("hk")) {
    return /^\d{1,5}$/u.test(code) ? `hk${code.padStart(5, "0")}` : null;
  }
  if (symbol.startsWith("us")) return null;
  return /^(?:sh|sz)\d{6}$/u.test(symbol) ? symbol : null;
};

const numeric = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" },
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
    // 空 body 是限流的表现，不是「这只股票没有数据」。
    if (text.trim().length === 0) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** 腾讯有时回 JSONP（`k={…}`），有时回纯 JSON。 */
const parseBody = (text: string | null): unknown => {
  if (text === null) return null;
  const trimmed = text.trim();
  const source = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("=") + 1).replace(/;\s*$/u, "");
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return null;
  }
};

const entryOf = (
  payload: unknown,
  code: string,
): Record<string, unknown> | null => {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  const entry = (data as Record<string, unknown>)[code];
  if (typeof entry !== "object" || entry === null) return null;
  return entry as Record<string, unknown>;
};

/*
 * 分时行：「时间 价格 累计成交量 累计成交额」。
 * 例如 0930 1355.00 227 30758500.00。
 *
 * 后两列是**累计**值，不是每分钟的——两只票实测都严格递增。我最初按
 * 每分钟读，还「验证」通过了：用的是第二个数据点，而开盘初期的累计均价
 * 恰好约等于当前价，怎么算都对得上。等到下午，成交量图变成一条平滑爬坡
 * （那正是累计曲线），均价则差出一百倍。
 *
 * 成交量的单位是**逐股不同**的，不是按市场分：
 *   茅台 600519  末行 25,411        当日 0.02 亿股 → 手
 *   长鑫 688825  末行 318,840,911   当日 3.18 亿股 → 股
 * 两只都是沪市，一个给手一个给股。所以不按前缀猜，改用成交额自证：
 * 累计额 ÷ 累计量 约等于价格就是股，约等于价格×100 就是手。
 */
const LOT_DETECTION_RATIO = 20;

const readMinuteRows = (rows: readonly unknown[]): readonly LinePoint[] => {
  const parsed: {
    amount: number;
    price: number;
    time: string;
    volume: number;
  }[] = [];

  for (const raw of rows) {
    if (typeof raw !== "string") continue;
    const parts = raw.trim().split(/\s+/u);
    if (parts.length < 4) continue;
    const [stamp, priceText, volumeText, amountText] = parts;
    if (stamp === undefined || !/^\d{4}$/u.test(stamp)) continue;
    const price = numeric(priceText);
    const volume = numeric(volumeText);
    const amount = numeric(amountText);
    if (price === null || volume === null || amount === null) continue;
    parsed.push({
      amount,
      price,
      time: `${stamp.slice(0, 2)}:${stamp.slice(2)}`,
      volume,
    });
  }
  if (parsed.length === 0) return [];

  /*
   * 单位判定用最后一行——它的累计量最大，比值最稳。
   * 比值接近价格就是股；接近价格的一百倍就是手。两者差两个数量级，
   * 拿 20 倍当分界，中间那一大片空档不会误判。
   */
  const tail = parsed.at(-1) as (typeof parsed)[number];
  const impliedPrice = tail.volume > 0 ? tail.amount / tail.volume : tail.price;
  const countsLots =
    tail.price > 0 && impliedPrice / tail.price > LOT_DETECTION_RATIO;
  const toShares = (volume: number): number =>
    countsLots ? volume * SHARES_PER_LOT : volume;

  return parsed.map((row, index) => {
    const previous = parsed[index - 1];
    const cumulativeShares = toShares(row.volume);
    return {
      /*
       * 均价直接取累计额 ÷ 累计股数——不用自己再累加一遍，
       * 累加累计值会得到一个越滚越大的数。
       */
      averagePrice:
        cumulativeShares > 0 ? row.amount / cumulativeShares : row.price,
      price: row.price,
      time: row.time,
      /* 每分钟的量是相邻两个累计值之差；第一分钟就是它自己。 */
      volumeShares:
        previous === undefined
          ? cumulativeShares
          : Math.max(0, cumulativeShares - toShares(previous.volume)),
    };
  });
};

const readCandleRows = (
  rows: readonly unknown[],
  countsLots: boolean,
): readonly CandleBar[] => {
  const bars: CandleBar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    // 日期,开,收,高,低,量 —— 收在第三位、高在第四位。
    const [open, close, high, low, volume] = (row as readonly unknown[]).slice(
      1,
      6,
    );
    const date = (row as readonly unknown[])[0];
    if (typeof date !== "string") continue;
    const values = [open, close, high, low, volume].map((raw) => numeric(raw));
    if (values.some((value) => value === null)) continue;
    const lots = values[4] as number;
    bars.push({
      close: values[1] as number,
      date,
      high: values[2] as number,
      low: values[3] as number,
      open: values[0] as number,
      volumeShares: countsLots ? lots * SHARES_PER_LOT : lots,
    });
  }
  return bars;
};

/**
 * 把月 K 折成年 K。
 *
 * 月 K 已经按时间升序，所以「当年第一根」就是先遇到的那根，末根就是最后覆盖
 * 上去的那根。高低取全年极值——不是任何单月的极值，这两者常常不在同一个月。
 */
const foldMonths = (
  monthly: readonly CandleBar[],
  keyOf: (date: string) => string,
): readonly CandleBar[] => {
  const byYear = new Map<string, CandleBar>();
  for (const bar of monthly) {
    const year = keyOf(bar.date);
    const running = byYear.get(year);
    if (running === undefined) {
      byYear.set(year, { ...bar, date: year });
      continue;
    }
    byYear.set(year, {
      /* 收盘价一路被后面的月份覆盖，最后留下的就是当年最后一个月的收。 */
      close: bar.close,
      date: year,
      high: Math.max(running.high, bar.high),
      low: Math.min(running.low, bar.low),
      /* 开盘价是当年第一根的，不动。 */
      open: running.open,
      volumeShares: running.volumeShares + bar.volumeShares,
    });
  }
  return [...byYear.values()];
};

const klinePath = (code: string): string =>
  code.startsWith("hk") ? "hkfqkline" : "fqkline";

/** 昨收：分时图的百分比刻度与涨跌配色都以它为基准。 */
const loadPreviousClose = async (code: string): Promise<number | null> => {
  const entry = entryOf(
    parseBody(
      await fetchText(
        `${WEB_ORIGIN}/appstock/app/${klinePath(code)}/get` +
          `?_var=k&param=${code},day,,,2,qfq`,
      ),
    ),
    code,
  );
  if (entry === null) return null;
  const rows = entry.qfqday;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  /*
   * 倒数第二根才是昨收。最后一根是今天——今天还没收盘，拿它当昨收，
   * 涨跌幅会恒等于零，那条零轴也就画到了今天的收盘价上。
   */
  const previous = rows.length >= 2 ? rows[rows.length - 2] : rows[0];
  if (!Array.isArray(previous) || previous.length < 3) return null;
  return numeric(previous[2]);
};

/**
 * 某只标的某个周期的图表数据；取不到时返回 null。
 *
 * 返回 null 而不是空序列：空序列会画出一张什么都没有的图，看着像这只
 * 股票停牌了，而实际上是没问到。
 */
/*
 * 一份很短命的内存缓存。
 *
 * 个股页上方有八个周期按钮，每按一次就是一次外呼，而外呼有闸：同一个来源每
 * 分钟 60 次。来回切几轮就把自己限住了——界面上写着「请求过于频繁」，而用户
 * 做的事只是在看同一只票的不同周期。
 *
 * 同一只票同一个周期，几十秒内本来就是同一份数据。盘中的分时要跟着走，所以
 * 它的窗口短；日周月年是收盘才变的，可以久一点。
 *
 * 只在内存里，进程重启即清空，多实例之间也不共享——当前是单进程部署，够用；
 * 别把它当成一层正经的缓存设施。
 */
const SERIES_CACHE_MS = { fast: 15_000, slow: 120_000 } as const;
/* 缓存本身不能变成内存耗尽的入口。 */
const MAX_SERIES_KEYS = 400;

const seriesCache = new Map<string, { at: number; value: ChartSeries }>();

const cacheWindowOf = (period: ChartPeriod): number =>
  period === "intraday" || period === "5day" || MINUTE_PERIODS.has(period)
    ? SERIES_CACHE_MS.fast
    : SERIES_CACHE_MS.slow;

/**
 * 清空缓存。
 *
 * 给用例用：两条用例问同一只票时，后一条会命中前一条留下的结果，于是
 * 「字段名拿错应当拿到空」这类断言拿到的是上一条的成功结果——而它会绿。
 */
export const resetChartSeriesCache = (): void => {
  seriesCache.clear();
};

/**
 * 缓存里现成的那一份；没有就是 null，不会去问上游。
 *
 * 路由拿它决定「这次要不要花外呼额度」。闸设在路由最前面时，命中缓存的请求
 * 也照样扣一次额度——于是在同一只票的八个周期之间来回切几轮就被限住，而这
 * 几轮里其实一次外呼都没发生。额度该记在真正出站的请求头上。
 */
export const peekChartSeries = (
  rawSymbol: string,
  period: ChartPeriod,
): ChartSeries | null => {
  const cached = seriesCache.get(`${rawSymbol.trim().toLowerCase()}:${period}`);
  if (cached === undefined) return null;
  return Date.now() - cached.at < cacheWindowOf(period) ? cached.value : null;
};

export const loadChartSeries = async (
  rawSymbol: string,
  period: ChartPeriod,
): Promise<ChartSeries | null> => {
  const symbol = rawSymbol.trim().toLowerCase();
  if (!isChartPeriod(period)) return null;
  const code = tencentCodeOf(symbol);
  if (code === null) return null;

  const cacheKey = `${symbol}:${period}`;
  const cached = seriesCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < cacheWindowOf(period)) {
    return cached.value;
  }

  /* 存一份，并且顺手把过期的清掉——不清的话这张表只会长不会缩。 */
  const remember = (value: ChartSeries): ChartSeries => {
    if (seriesCache.size >= MAX_SERIES_KEYS) {
      const now = Date.now();
      for (const [key, entry] of seriesCache) {
        if (now - entry.at >= cacheWindowOf(period)) seriesCache.delete(key);
      }
      /* 全都还新鲜时，丢掉最早插入的那个：Map 按插入顺序迭代。 */
      if (seriesCache.size >= MAX_SERIES_KEYS) {
        const oldest = seriesCache.keys().next();
        if (!oldest.done) seriesCache.delete(oldest.value);
      }
    }
    seriesCache.set(cacheKey, { at: Date.now(), value });
    return value;
  };

  // 沪深按手给量，港美股按股。
  const countsLots = !symbol.startsWith("hk") && !symbol.startsWith("us");

  if (period === "intraday" || period === "5day") {
    const path = period === "intraday" ? "minute/query" : "day/query";
    const entry = entryOf(
      parseBody(
        await fetchText(`${WEB_ORIGIN}/appstock/app/${path}?code=${code}`),
      ),
      code,
    );
    if (entry === null) return null;
    const data = entry.data;
    if (typeof data !== "object" || data === null) return null;

    /*
     * 分时是一天一段，五日是五段。五日那份把每天的行摊平接起来——
     * 时间轴会重复（每天都从 09:30 开始），按顺序画即可。
     */
    const segments: readonly unknown[] = Array.isArray(data) ? data : [data];
    const rows: unknown[] = [];
    for (const segment of segments) {
      if (typeof segment !== "object" || segment === null) continue;
      const inner = (segment as Record<string, unknown>).data;
      if (Array.isArray(inner)) rows.push(...inner);
    }

    const points = readMinuteRows(rows);
    if (points.length === 0) return null;
    return remember({
      kind: "line",
      period,
      points,
      previousClose: await loadPreviousClose(code),
      symbol,
    });
  }

  /*
   * 年 K 由月 K 折出来，不问上游的 year 字段。
   *
   * 上游那个字段只回一根——就是今年的那根。一根蜡烛不是一张图：年 K 点开，
   * 屏幕正中一个孤零零的方块，而请求成功、不报错，界面上也没有任何地方说
   * 「只有一根」。
   *
   * 月 K 能回到 2001 年，折一遍就是完整的年 K：开取当年首月的开，收取末月的
   * 收，高低取全年极值，量求和。这不是造数据，是同一份数据换个粒度，每一格
   * 都能拿月 K 对上。
   */
  if (period === "year" || period === "quarter") {
    const monthly = await loadChartSeries(symbol, "month");
    if (monthly === null || monthly.kind !== "candle") return null;
    const bars = foldMonths(
      monthly.bars,
      period === "year"
        ? (date) => date.slice(0, 4)
        : /* 2025-05-31 → 2025Q2 */
          (date) =>
            `${date.slice(0, 4)}Q${String(Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1)}`,
    );
    if (bars.length === 0) return null;
    return remember({
      bars,
      kind: "candle",
      period,
      previousClose: null,
      symbol,
    });
  }

  const config = CANDLE_PERIODS[period];
  const isMinute = MINUTE_PERIODS.has(period);
  const url = isMinute
    ? `${MINUTE_ORIGIN}/appstock/app/kline/mkline` +
      `?param=${code},${config.param},,${String(BAR_LIMIT)}`
    : `${WEB_ORIGIN}/appstock/app/${klinePath(code)}/get` +
      `?_var=k&param=${code},${config.param},,,${String(BAR_LIMIT)},qfq`;

  const entry = entryOf(parseBody(await fetchText(url)), code);
  if (entry === null) return null;
  const raw = entry[config.field];
  const bars = readCandleRows(Array.isArray(raw) ? raw : [], countsLots);
  if (bars.length === 0) return null;

  return remember({
    bars,
    kind: "candle",
    period,
    previousClose: null,
    symbol,
  });
};
