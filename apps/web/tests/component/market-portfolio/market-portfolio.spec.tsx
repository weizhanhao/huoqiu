import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as realMarketOverview from "../../../src/features/market-portfolio/real-market-overview";
import * as realMarketRankings from "../../../src/features/market-portfolio/real-market-rankings";

const featureRoot = fileURLToPath(
  new URL("../../../src/features/market-portfolio/", import.meta.url),
);

/*
 * 行情与组合这一竖切。
 *
 * 这一份此前断言的是「样本行情模块存在、样本标的齐全、样本概念热度是某个
 * 具体数字」——那正是本轮删掉的东西：行情看板、涨跌榜与 35 个虚构公司，
 * 数据全是写死的常量。
 *
 * 现在断言两件事：真实模块在；样本行情模块不许回来。后者是有意义的门禁——
 * 把那几个文件恢复出来，页面照样能渲染、测试照样绿，只是全站又开始供应
 * 编造的行情。
 */
describe("market and portfolio vertical slice", () => {
  it.each([
    "real-market-overview.tsx",
    "real-market-rankings.tsx",
    /*
     * 组合那两个模块也换过了：榜单和详情页读的是账号真实建过的组合
     * （portfolio-leaderboard / portfolio-holdings），不再有写死的 SYN001-012。
     */
    "portfolio-leaderboard.tsx",
    "portfolio-holdings.tsx",
    "market-portfolio.module.css",
  ])("provides the isolated %s feature module", (filename) => {
    expect(existsSync(`${featureRoot}/${filename}`)).toBe(true);
  });

  it.each([
    "market-dashboard.tsx",
    "market-rankings.tsx",
    "synthetic-instrument-detail.tsx",
  ])("no longer ships the sample surface %s", (filename) => {
    /*
     * 这三个渲染的是写死的行情：切市场、切涨跌榜都有反应，但每一行都不是
     * 真的。它们已经被公开行情接口取代，不该再出现在包里。
     */
    expect(existsSync(`${featureRoot}/${filename}`)).toBe(false);
  });

  it.each([
    ["RealMarketOverview", realMarketOverview],
    ["RealMarketRankings", realMarketRankings],
  ])("exports %s", (exportName, module) => {
    expect(module).toHaveProperty(exportName);
  });
});
