/*
 * 抓取真实日 K 线并落成本地快照。
 *
 * 只在服务端运行。浏览器绝不直连第三方（HANDOFF 第 3.2 节），
 * 页面只读这里生成的快照。
 *
 * 数据源选型记录（2026-08-13 实测）：
 *   - 币安 / Coinbase / CoinGecko / Kraken：本机网络不通（http=000）
 *   - Yahoo Finance：返回同意页 HTML，非 JSON
 *   - Stooq：JS 工作量证明反爬，不绕
 *   - 东方财富 push2his：可用，但连续请求后被限流
 *   - 新浪财经：稳定可用，返回真实 OHLC —— 采用，并按 2 秒节奏请求
 *
 * 校验一律「失败即拒绝写入」：宁可让页面显示「快照尚未生成」，
 * 也不写入半截或可疑的数据。K 线尤其如此——一根错误的蜡烛比没有图更糟。
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const API_ORIGIN = "https://money.finance.sina.com.cn";
const API_PATH = "/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

/** 日线。新浪用「分钟数」表示周期，240 分钟 = 1 个交易日。 */
const DAILY_SCALE = 240;
const BAR_COUNT = 180;
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_SPACING_MS = 2_000;
const MAX_BYTES = 1024 * 1024;
/** 低于这个根数说明抓取不完整，整个标的丢弃而不是残缺展示。 */
const MINIMUM_BARS = 30;

const SERIES = [
  { market: "指数", name: "上证指数", symbol: "sh000001" },
  { market: "指数", name: "深证成指", symbol: "sz399001" },
  { market: "指数", name: "创业板指", symbol: "sz399006" },
  { market: "指数", name: "沪深 300", symbol: "sh000300" },
  { market: "指数", name: "中证 500", symbol: "sh000905" },
  { market: "沪深", name: "贵州茅台", symbol: "sh600519" },
  { market: "沪深", name: "五粮液", symbol: "sz000858" },
  { market: "沪深", name: "中国平安", symbol: "sh601318" },
];

const sleep = (ms) =>
  new Promise((resolveTimer) => {
    setTimeout(resolveTimer, ms);
  });

const fetchSeries = async (symbol) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${API_ORIGIN}${API_PATH}?symbol=${symbol}&scale=${DAILY_SCALE}&ma=no&datalen=${BAR_COUNT}`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`KLINE_HTTP_${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) {
      throw new Error("KLINE_RESPONSE_TOO_LARGE");
    }
    if (text.trim().length === 0) {
      throw new Error("KLINE_EMPTY_RESPONSE");
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/*
 * 单根蜡烛的自洽性检查。
 *
 * 这几条不是形式主义：high < open 之类的数据一旦画进图里，蜡烛的影线会
 * 反向伸出实体，读图的人会以为自己看错了。数据源偶发抽风时必须挡在这里。
 */
const normalizeBar = (raw) => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const date = typeof raw.day === "string" ? raw.day.slice(0, 10) : "";
  if (!DATE_PATTERN.test(date)) {
    return null;
  }

  const open = toFiniteNumber(raw.open);
  const high = toFiniteNumber(raw.high);
  const low = toFiniteNumber(raw.low);
  const close = toFiniteNumber(raw.close);
  const volume = toFiniteNumber(raw.volume);

  if (open === null || high === null || low === null || close === null) {
    return null;
  }
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return null;
  }
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return null;
  }
  if (low > high) {
    return null;
  }

  return {
    close,
    date,
    high,
    low,
    open,
    volume: volume !== null && volume >= 0 ? volume : 0,
  };
};

const normalizeSeries = (raw) => {
  if (!Array.isArray(raw)) {
    return null;
  }

  const bars = [];
  const seen = new Set();
  for (const entry of raw) {
    const bar = normalizeBar(entry);
    if (bar === null) {
      // 单根坏数据不拖垮整条序列；但总根数不足时整条丢弃。
      continue;
    }
    if (seen.has(bar.date)) {
      continue;
    }
    seen.add(bar.date);
    bars.push(bar);
  }

  bars.sort((left, right) => left.date.localeCompare(right.date));
  return bars.length >= MINIMUM_BARS ? bars : null;
};

const main = async () => {
  const series = [];
  const skipped = [];

  for (const entry of SERIES) {
    try {
      const raw = await fetchSeries(entry.symbol);
      const bars = normalizeSeries(raw);
      if (bars === null) {
        skipped.push(`${entry.symbol}:INSUFFICIENT_BARS`);
      } else {
        series.push({ ...entry, bars });
      }
    } catch (error) {
      skipped.push(`${entry.symbol}:${String(error?.message ?? error)}`);
    }
    await sleep(REQUEST_SPACING_MS);
  }

  if (series.length === 0) {
    throw new Error(`NO_SERIES_AVAILABLE ${skipped.join(",")}`);
  }

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    series,
    source: "新浪财经公开行情接口",
    sourceNote: "日线收盘数据，非实时；仅用于本地预览展示。",
  };

  const directory =
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY ??
    resolve(process.cwd(), ".runtime/finance");
  await mkdir(directory, { recursive: true });
  const target = resolve(directory, "kline-v1.json");
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);

  /*
   * 这里不像 FX 那样再产出一份 TS 常量。
   *
   * 1440 根 K 线约 270KB，作为编译期常量会被打进浏览器包，直接冲垮
   * 落地页 150KB 的 JS 预算。改为：只留 JSON，服务端读取，图表组件
   * 接收 bars 作为 props——组件本身不碰 node:fs，测试 harness 照样能
   * 把它打进浏览器运行。
   */
  process.stdout.write(
    `KLINE_SNAPSHOT_WRITTEN ${target} series=${series.length} skipped=${skipped.length === 0 ? "none" : skipped.join(",")}\n`,
  );
};

main().catch((error) => {
  process.stderr.write(
    `KLINE_SNAPSHOT_FAILED ${String(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
});
