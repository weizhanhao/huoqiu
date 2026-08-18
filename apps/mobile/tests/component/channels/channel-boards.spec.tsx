import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  EtfRow,
  FundRow,
  PrivateFundManager,
} from "../../../src/api/market-api";
import {
  EtfBoard,
  FundBoard,
  PrivateBoard,
} from "../../../src/components/channels/channel-boards";

/*
 * 基金 / ETF / 私募三个频道顶上的真实榜单。
 *
 * 这三个频道此前只筛帖子：站上没人写过基金，页面就整屏空着，只留一句「在帖子
 * 里写上基金代码」。可这三个频道的名字承诺的是「这里有基金」，不是「这里有人
 * 聊过基金」——而三张真名单（净值、ETF 行情、中基协备案）服务端一直都在回。
 *
 * 名单在上、讨论在下：先给内容，再给内容旁边的话。
 */

const fund = (
  code: string,
  name: string,
  nav: number | null,
  dayPct: number | null,
): FundRow => ({
  category: "指数型",
  code,
  dayPct,
  name,
  nav,
  navDate: "2026-08-14",
  oneYearPct: 12.5,
});

const etf = (code: string, name: string, symbol: string | null): EtfRow => ({
  changePercent: 1.23,
  code,
  href: symbol === null ? null : `/instruments/${symbol}`,
  last: 3.456,
  name,
});

const manager = (name: string, fundCount: number): PrivateFundManager => ({
  disclosureUrl: "https://gs.amac.org.cn/example",
  establishedOn: "2015-06-01",
  fundCount,
  investType: "证券投资基金",
  legalPerson: "某某",
  name,
});

describe("fund board", () => {
  it("lists real funds with their net value and date", () => {
    const markup = renderToStaticMarkup(
      <FundBoard funds={[fund("012348", "某某沪深300指数A", 1.6842, 0.83)]} />,
    );

    expect(markup).toContain("某某沪深300指数A");
    expect(markup).toContain("012348");
    /* 净值四位，和基金业的惯例一致——两位会把万分之几的差抹平。 */
    expect(markup).toContain("1.6842");
    expect(markup).toContain("+0.83%");
    /* 净值是哪一天的必须写出来：基金净值天然滞后，不标日期会被当成实时。 */
    expect(markup).toContain("2026-08-14");
  });

  it("writes 破折号 for a fund that has not disclosed a net value", () => {
    /* 新基金还没披露净值。当成 0 的话，涨幅榜上它会排在最后一名。 */
    const markup = renderToStaticMarkup(
      <FundBoard funds={[fund("099999", "某某新发基金", null, null)]} />,
    );

    expect(markup).toContain("某某新发基金");
    expect(markup).toContain("—");
    expect(markup).not.toContain("0.0000");
  });

  it("separates still-loading from genuinely empty", () => {
    expect(renderToStaticMarkup(<FundBoard funds={null} />)).toContain(
      "正在读取",
    );
    expect(renderToStaticMarkup(<FundBoard funds={[]} />)).toContain(
      "没有取到",
    );
  });
});

describe("etf board", () => {
  it("lets you open an ETF and add it to the watchlist", () => {
    const markup = renderToStaticMarkup(
      <EtfBoard
        etfs={[etf("510300", "沪深300ETF", "sh510300")]}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
        watchlist={[]}
      />,
    );

    expect(markup).toContain("沪深300ETF");
    expect(markup).toContain("510300");
    expect(markup).toContain("加自选");
  });

  it("says 已添加 for an ETF already on the watchlist", () => {
    /* 和高人气股票榜同一条规矩：加过的不能再摆一个「加自选」。 */
    const markup = renderToStaticMarkup(
      <EtfBoard
        etfs={[etf("510300", "沪深300ETF", "sh510300")]}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
        watchlist={["sh510300"]}
      />,
    );

    expect(markup).toContain("已添加");
    expect(markup).not.toContain(">加自选<");
  });
});

describe("private fund board", () => {
  it("shows the manager with a link back to the official record", () => {
    /*
     * 私募信息必须能追回中基协的公示页——没有出处的私募名单，读的人无从
     * 分辨我们是抄来的还是编的。
     */
    const markup = renderToStaticMarkup(
      <PrivateBoard
        managers={[manager("某某资产管理", 23)]}
        onOpen={vi.fn()}
      />,
    );

    expect(markup).toContain("某某资产管理");
    expect(markup).toContain("23");
    expect(markup).toContain("证券投资基金");
    expect(markup).toContain("中基协");
  });
});
