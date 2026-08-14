import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  findKlineSeries,
  loadKlineSnapshot,
} from "../../src/features/real-finance/kline.server";

/*
 * K 线快照读取端的守门测试。
 *
 * 守的是一条底线：数据不可信时必须拒绝显示，绝不画出可疑的蜡烛，也绝不
 * 回落到合成数据。一根 high < close 的蜡烛画出来，影线会反向伸出实体，
 * 读图的人只会以为自己看错了——那比整条不显示危险得多。
 *
 * 全部用临时目录里的合成快照，不触碰真实的 .runtime/finance/kline-v1.json。
 */

const MINIMUM_BARS = 30;

const makeBar = (index: number) => {
  const day = String((index % 28) + 1).padStart(2, "0");
  const month = String(Math.floor(index / 28) + 1).padStart(2, "0");
  return {
    close: 10.5,
    date: `2026-${month}-${day}`,
    high: 11,
    low: 9,
    open: 10,
    volume: 1000 + index,
  };
};

const defaultBars = (): Record<string, unknown>[] =>
  Array.from({ length: MINIMUM_BARS }, (_unused, index) => makeBar(index));

const makeSnapshot = (bars: readonly Record<string, unknown>[]) => ({
  fetchedAt: "2026-01-02T00:00:00.000Z",
  series: [
    {
      bars,
      market: "指数",
      name: "测试标的",
      symbol: "test001",
    },
  ],
  source: "测试源",
  sourceNote: "测试说明",
});

const originalDirectory = process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;

const writeSnapshot = (snapshot: unknown): void => {
  const directory = mkdtempSync(resolve(tmpdir(), "huoqiu-kline-"));
  writeFileSync(
    resolve(directory, "kline-v1.json"),
    JSON.stringify(snapshot),
    "utf8",
  );
  process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = directory;
};

afterEach(() => {
  if (originalDirectory === undefined) {
    delete process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY;
    return;
  }
  process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = originalDirectory;
});

describe("真实 K 线快照读取", () => {
  it("读出结构完整的快照，并保留全部交易日", () => {
    writeSnapshot(makeSnapshot(defaultBars()));

    const snapshot = loadKlineSnapshot();

    expect(snapshot).not.toBeNull();
    expect(snapshot?.series).toHaveLength(1);
    expect(snapshot?.series[0]?.bars).toHaveLength(MINIMUM_BARS);
    expect(snapshot?.source).toBe("测试源");
    expect(findKlineSeries("test001")?.name).toBe("测试标的");
    expect(findKlineSeries("不存在")).toBeNull();
  });

  it("拒绝影线与实体矛盾的蜡烛，而不是画出来", () => {
    const bars = defaultBars();
    // 最高价低于收盘价：真实行情不可能出现，只可能是数据损坏。
    bars[5] = { ...bars[5], close: 12, high: 11 };
    writeSnapshot(makeSnapshot(bars));

    expect(loadKlineSnapshot()).toBeNull();
  });

  it("拒绝重复交易日，避免同一天被画两根", () => {
    const bars = defaultBars();
    bars[7] = { ...bars[7], date: bars[6]?.date as string };
    writeSnapshot(makeSnapshot(bars));

    expect(loadKlineSnapshot()).toBeNull();
  });

  it("拒绝根数不足的序列，不展示半截走势", () => {
    writeSnapshot(makeSnapshot(defaultBars().slice(0, MINIMUM_BARS - 1)));

    expect(loadKlineSnapshot()).toBeNull();
  });

  it("快照缺失或损坏时返回 null，而不是抛错或伪造数据", () => {
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = resolve(
      tmpdir(),
      "huoqiu-kline-absent",
    );
    expect(loadKlineSnapshot()).toBeNull();

    const directory = mkdtempSync(resolve(tmpdir(), "huoqiu-kline-"));
    writeFileSync(resolve(directory, "kline-v1.json"), "{ 不是 JSON", "utf8");
    process.env.HUOQIU_FINANCE_SNAPSHOT_DIRECTORY = directory;
    expect(loadKlineSnapshot()).toBeNull();
  });
});
