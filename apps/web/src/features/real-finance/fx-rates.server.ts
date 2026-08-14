import { fxSnapshotData } from "./fx-snapshot.generated";

/*
 * 真实外汇行情（欧洲央行参考汇率，经 Frankfurter 提供）。
 *
 * 为什么是汇率而不是股票行情：
 * 实测下来，能在不需要密钥、不对抗反爬、不违反使用条款的前提下拿到的
 * 公开财经数据只有这一类。Stooq 已上 JS 工作量证明验证，绕过它就是
 * 对抗反爬机制；CoinGecko 直接返回空。ECB 参考汇率是官方公开数据，
 * Frankfurter 提供无密钥的免费接口，这是干净的。
 *
 * 架构边界（HANDOFF 第 3.2 节）：浏览器绝不直连第三方。
 * 抓取由 scripts/fetch-fx-rates.mjs 在服务端完成并落成本地快照，
 * 这里只读快照。快照缺失或损坏时 fail closed —— 返回 null，
 * 页面显示「暂无真实汇率」，绝不用合成数据冒充。
 */

export type FxRate = Readonly<{
  changePct: number | null;
  code: string;
  label: string;
  /** 1 单位基准货币可兑换的目标货币数量。 */
  rate: number;
}>;

export type FxSnapshot = Readonly<{
  base: string;
  /** 参考汇率对应的日期，ECB 按工作日发布。 */
  date: string;
  fetchedAt: string;
  rates: readonly FxRate[];
  source: string;
  sourceUrl: string;
}>;

const CURRENCY_LABELS: Readonly<Record<string, string>> = {
  AUD: "澳元",
  CAD: "加元",
  CHF: "瑞郎",
  EUR: "欧元",
  GBP: "英镑",
  HKD: "港币",
  JPY: "日元",
  KRW: "韩元",
  SGD: "新元",
  USD: "美元",
};

type RawSnapshot = Readonly<{
  base?: unknown;
  date?: unknown;
  fetchedAt?: unknown;
  previous?: unknown;
  rates?: unknown;
}>;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRateMap = (value: unknown): value is Readonly<Record<string, number>> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every(isFiniteNumber);

/**
 * 读取本地汇率快照。
 *
 * 数据来自 fx-snapshot.generated.ts（由抓取脚本产出的编译期常量），
 * 不在这里读文件：壳层会被测试 harness 打进浏览器运行，那里没有 node:fs。
 * 同步返回也让壳层不必变成 async——否则 25 个调用点和全部
 * renderToStaticMarkup 组件测试会一起失效。
 *
 * 任何字段不合预期一律返回 null——宁可页面上少一个模块，
 * 也不把半截数据当成真实行情展示出去。
 */
export const loadFxSnapshot = (): FxSnapshot | null => {
  const parsed = fxSnapshotData as RawSnapshot;
  const { base, date, fetchedAt, previous, rates } = parsed;
  if (
    typeof base !== "string" ||
    typeof date !== "string" ||
    typeof fetchedAt !== "string" ||
    !isRateMap(rates)
  ) {
    return null;
  }

  const previousRates = isRateMap(previous) ? previous : {};
  const entries = Object.entries(rates)
    .filter(([code]) => code in CURRENCY_LABELS)
    .map<FxRate>(([code, rate]) => {
      const earlier = previousRates[code];
      return {
        changePct:
          isFiniteNumber(earlier) && earlier !== 0
            ? Number((((rate - earlier) / earlier) * 100).toFixed(3))
            : null,
        code,
        label: CURRENCY_LABELS[code] ?? code,
        rate,
      };
    })
    .toSorted((left, right) => left.code.localeCompare(right.code));

  if (entries.length === 0) return null;

  return {
    base,
    date,
    fetchedAt,
    rates: entries,
    source: "欧洲央行参考汇率（Frankfurter）",
    sourceUrl: "https://www.frankfurter.app/",
  };
};
