import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HotRow } from "../../../src/api/market-api";
import { WatchlistChannel } from "../../../src/components/channels/channel-views";

/*
 * 自选频道里那张「高人气股票」榜。
 *
 * 每行右边一个「加自选」。此前那四个字是写死的：已经在自选里的票，按钮照旧
 * 写着「加自选」，还能再按一次，按完再弹一遍「已加自选」。用户的原话是
 * 「加了自选后，应该图标要换吧？为什么还可以加自选？」——一个按下去什么都
 * 没发生的按钮，比灰掉更让人怀疑是不是没生效。
 *
 * 组件手里本来就有自选列表（symbols），只是没拿它做判断。
 */

const hotRow = (code: string, symbol: string): HotRow => ({
  changePercent: 3.21,
  code,
  href: `/instruments/${symbol}`,
  last: 12.3,
  name: `票${code}`,
});

const render = (
  overrides: Partial<Parameters<typeof WatchlistChannel>[0]> = {},
): string =>
  renderToStaticMarkup(
    <WatchlistChannel
      hot={[hotRow("300314", "sz300314"), hotRow("600519", "sh600519")]}
      onAdd={vi.fn()}
      onOpenInstrument={vi.fn()}
      signedIn
      symbols={[]}
      {...overrides}
    />,
  );

/*
 * 取某一行那颗按钮本身。
 *
 * 定位靠无障碍标签而不是「第几个按钮」：行内还有一颗打开个股的按钮，行与行
 * 之间也只差一个名字，按顺序数迟早数到隔壁那一行去。
 */
const addButton = (
  markup: string,
  name: string,
): Readonly<{ disabled: boolean; text: string }> => {
  const pending = markup.indexOf(`aria-label="把 ${name} 加进自选"`);
  const done = markup.indexOf(`aria-label="${name} 已在自选里"`);
  const anchor = pending === -1 ? done : pending;
  expect(anchor).toBeGreaterThan(-1);

  const element = markup.slice(
    markup.lastIndexOf("<button", anchor),
    markup.indexOf("</button>", anchor),
  );
  return {
    disabled: element.includes('aria-disabled="true"'),
    text: element.includes("已添加") ? "已添加" : "加自选",
  };
};

describe("watchlist channel pick list", () => {
  it("says 已添加 for a symbol already on the watchlist", () => {
    const markup = render({ symbols: ["sz300314"] });

    expect(addButton(markup, "票300314").text).toBe("已添加");
    /* 没加过的那只不能跟着一起变——否则加一只等于全变。 */
    expect(addButton(markup, "票600519").text).toBe("加自选");
  });

  it("stops the button from firing twice", () => {
    /*
     * 灰掉不只是长得不一样：还得真按不动。只改字不改状态的话，那几个字
     * 变了、按下去还是会再发一次请求。
     */
    const markup = render({ symbols: ["sz300314"] });

    expect(addButton(markup, "票300314").disabled).toBe(true);
  });

  it("keeps 加自选 tappable for anything not on the list", () => {
    const markup = render({ symbols: [] });

    expect(addButton(markup, "票300314").disabled).toBe(false);
  });
});
