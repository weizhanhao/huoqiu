import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublicPortfolio, Quote } from "../../../src/api/market-api";
import { PortfolioDetailScreen } from "../../../src/components/markets/portfolio-detail-screen";

/*
 * 组合详情。
 *
 * 这一页此前读合成夹具，真组合点进来是「未找到该合成组合」。现在守的是：数字
 * 要么是真的，要么明说没有——尤其是「成立以来收益」那一类编得出来、又最容易
 * 被当真的东西。
 */

const portfolio: PublicPortfolio = {
  followerCount: 3,
  holdings: [
    { symbol: "sh600519", weight: 60 },
    { symbol: "sz000001", weight: 40 },
  ],
  id: "pf_1",
  name: "稳一点",
  ownerName: "林岸",
};

const quote = (symbol: string, name: string, changePercent: number): Quote => ({
  changeAmount: 1,
  changePercent,
  last: 100,
  name,
  symbol,
  tradedAtSeconds: 1_760_000_000,
});

const render = (
  overrides: Partial<Parameters<typeof PortfolioDetailScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <PortfolioDetailScreen
      dayReturn={1.2}
      failure={null}
      following={false}
      loaded
      onBack={vi.fn()}
      onOpenInstrument={vi.fn()}
      onToggleFollow={vi.fn()}
      portfolio={portfolio}
      quotes={
        new Map([
          ["sh600519", quote("sh600519", "贵州茅台", 2)],
          ["sz000001", quote("sz000001", "平安银行", -0.5)],
        ])
      }
      {...overrides}
    />,
  );

describe("portfolio detail", () => {
  it("shows the holdings with their weights and live moves", () => {
    const markup = render();

    expect(markup).toContain("稳一点");
    expect(markup).toContain("林岸 主理");
    expect(markup).toContain("贵州茅台");
    expect(markup).toContain("60.00%");
    expect(markup).toContain("+2.00%");
    expect(markup).toContain("-0.50%");
  });

  it("says it only reports the day, not returns since inception", () => {
    /*
     * 没有成本价就算不出「成立以来收益」。参考图上那个数字很显眼，照着摆一个
     * 出来是最容易的，也最容易被人当成真的拿去比较。
     */
    const markup = render();

    expect(markup).toContain("当日收益");
    /* 那句说明本身就带「成立以来」，所以断的是它说了没有，而不是这四个字缺席。 */
    expect(markup).toContain("没有成本价，所以不报成立以来的收益");
  });

  it("writes a dash when one holding has no quote", () => {
    /*
     * 断的是「每只持仓的涨跌都写成 —」，不是「整页没有 0.00%」——权重那一列
     * 的 60.00% 里就含着 0.00%，那种断言看着通过，其实什么也没守。
     */
    const markup = render({ dayReturn: null, quotes: new Map() });
    const dashes = markup.split("—").length - 1;

    /* 两只持仓各一个，再加上顶部的当日收益。 */
    expect(dashes).toBe(3);
  });

  it("does not offer to follow your own portfolio", () => {
    expect(render({ following: null })).not.toContain(
      'data-testid="portfolio-follow"',
    );
    expect(render()).toContain('data-testid="portfolio-follow"');
  });

  it("tells a missing portfolio apart from one still loading", () => {
    const loading = render({ loaded: false, portfolio: null });
    const gone = render({ loaded: true, portfolio: null });
    const broken = render({ failure: "连不上服务器。", portfolio: null });

    expect(loading).toContain("正在读取组合");
    expect(gone).toContain("不在了");
    expect(broken).toContain("连不上服务器");
  });
});
