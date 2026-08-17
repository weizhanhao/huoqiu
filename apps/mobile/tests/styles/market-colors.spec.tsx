import { tokens } from "@huoqiu/native-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Quote } from "../../src/api/market-api";
import { WatchlistScreen } from "../../src/components/markets/watchlist-screen";
import { MarketColorProvider } from "../../src/styles/market-colors";
import { signColorFor } from "../../src/styles/market-sign";

/*
 * 涨跌配色。
 *
 * 设置页里这一项一度是个假开关：存进了服务端、界面打了勾，但没有任何组件读它，
 * 行情该红还是红。一个存了库、界面确认过、却不生效的开关，比没有这个开关伤害
 * 大——用户会以为没保存上，再选一次，还是不变。
 *
 * 所以这里不只测那个纯函数，还要测「选了之后，屏幕上真的变了」。
 */

const quote = (changePercent: number): Quote => ({
  changeAmount: 1,
  changePercent,
  last: 100,
  name: "贵州茅台",
  symbol: "sh600519",
  tradedAtSeconds: 1_760_000_000,
});

const renderWatchlist = (mode: "green-up" | "red-up"): string =>
  renderToStaticMarkup(
    <MarketColorProvider mode={mode}>
      <WatchlistScreen
        failure={null}
        loading={false}
        onOpenInstrument={vi.fn()}
        onRefresh={vi.fn()}
        quotes={[quote(2)]}
        signedIn
        symbols={["sh600519"]}
      />
    </MarketColorProvider>,
  );

describe("sign color", () => {
  it("flips up and down when the account chose green-up", () => {
    expect(signColorFor("red-up", 2)).toBe(tokens.market.upText);
    expect(signColorFor("green-up", 2)).toBe(tokens.market.downText);
    expect(signColorFor("red-up", -2)).toBe(tokens.market.downText);
    expect(signColorFor("green-up", -2)).toBe(tokens.market.upText);
  });

  it("leaves flat and unknown neutral in both modes", () => {
    for (const mode of ["red-up", "green-up"] as const) {
      expect(signColorFor(mode, 0)).toBe(tokens.text.secondary);
      expect(signColorFor(mode, null)).toBe(tokens.text.secondary);
    }
  });
});

describe("market color provider", () => {
  it("actually repaints a screen when the mode changes", () => {
    /*
     * 这条才是关键。上面两条就算全过，只要屏幕组件没接上这个 context，设置页
     * 那一项照样是摆设——而那正是它此前的状态。
     */
    const redUp = renderWatchlist("red-up");
    const greenUp = renderWatchlist("green-up");

    expect(redUp).not.toBe(greenUp);
  });
});
