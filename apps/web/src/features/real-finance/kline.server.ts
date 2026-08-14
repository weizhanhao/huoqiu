import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 真实日 K 线快照的读取端。
 *
 * 只在服务端运行。文件名带 .server 是给人看的约定，真正的保证是它 import 了
 * node:fs——任何会被打进浏览器的模块都不能引它。图表组件不引本文件，而是从
 * 页面接收 bars 作为 props，这样组件在浏览器测试夹具里照样能跑。
 *
 * 校验在这里再做一遍。写入端已经校验过，但快照文件可能被手改、被中断的写入
 * 截断、或来自旧版本。读到不自洽的数据一律判为不可用并返回 null，页面显示
 * 「快照尚未生成」——绝不把可疑的蜡烛画出来，也绝不回落到合成数据。
 */

export type KlineBar = Readonly<{
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volume: number;
}>;

export type KlineSeries = Readonly<{
  bars: readonly KlineBar[];
  market: string;
  name: string;
  symbol: string;
}>;

export type KlineSnapshot = Readonly<{
  fetchedAt: string;
  series: readonly KlineSeries[];
  source: string;
  sourceNote: string;
}>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MINIMUM_BARS = 30;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const parseBar = (raw: unknown): KlineBar | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const { close, date, high, low, open, volume } = value;

  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return null;
  }
  if (
    !isPositiveNumber(open) ||
    !isPositiveNumber(high) ||
    !isPositiveNumber(low) ||
    !isPositiveNumber(close)
  ) {
    return null;
  }
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return null;
  }
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) {
    return null;
  }

  return { close, date, high, low, open, volume };
};

const parseSeries = (raw: unknown): KlineSeries | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const { bars, market, name, symbol } = value;

  if (
    typeof market !== "string" ||
    typeof name !== "string" ||
    typeof symbol !== "string" ||
    !Array.isArray(bars)
  ) {
    return null;
  }

  const parsed: KlineBar[] = [];
  for (const entry of bars) {
    const bar = parseBar(entry);
    /*
     * 一根坏数据就判整条不可用。K 线是连续序列，中间挖个洞会让涨跌幅、
     * 均线和区间高低点全部算错——那比整条不显示危险得多。
     */
    if (bar === null) {
      return null;
    }
    if (parsed.at(-1)?.date === bar.date) {
      return null;
    }
    parsed.push(bar);
  }

  if (parsed.length < MINIMUM_BARS) {
    return null;
  }
  return { bars: parsed, market, name, symbol };
};

const snapshotPath = (): string =>
  resolve(
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY ??
      resolve(process.cwd(), ".runtime/finance"),
    "kline-v1.json",
  );

export const loadKlineSnapshot = (): KlineSnapshot | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(snapshotPath(), "utf8"));
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const { fetchedAt, series, source, sourceNote } = value;

  if (
    typeof fetchedAt !== "string" ||
    typeof source !== "string" ||
    typeof sourceNote !== "string" ||
    !Array.isArray(series)
  ) {
    return null;
  }

  const parsed = series
    .map((entry) => parseSeries(entry))
    .filter((entry): entry is KlineSeries => entry !== null);

  return parsed.length === 0
    ? null
    : { fetchedAt, series: parsed, source, sourceNote };
};

export const findKlineSeries = (symbol: string): KlineSeries | null =>
  loadKlineSnapshot()?.series.find((entry) => entry.symbol === symbol) ?? null;
