import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PortfolioComposer,
  canSave,
  totalWeight,
  type DraftHolding,
} from "../../../src/components/markets/portfolio-composer";

/*
 * 新建组合。
 *
 * 服务端要求权重合计正好 100%，不够就整条退回。界面上不当场显示的话，人得攒完
 * 十只、按下保存、看到一句「当前为 97%」，然后自己一项项去找差在哪。
 */

const holding = (symbol: string, weight: string): DraftHolding => ({
  name: symbol.toUpperCase(),
  symbol,
  weight,
});

const render = (
  overrides: Partial<Parameters<typeof PortfolioComposer>[0]> = {},
): string =>
  renderToStaticMarkup(
    <PortfolioComposer
      failure={null}
      holdings={[]}
      name=""
      onChangeName={vi.fn()}
      onChangeQuery={vi.fn()}
      onChangeSummary={vi.fn()}
      onChangeWeight={vi.fn()}
      onClose={vi.fn()}
      onPick={vi.fn()}
      onRemove={vi.fn()}
      onSubmit={vi.fn()}
      onTogglePicker={vi.fn()}
      picking={false}
      query=""
      results={null}
      saving={false}
      summary=""
      {...overrides}
    />,
  );

const saveDisabled = (markup: string): boolean => {
  const at = markup.indexOf('data-testid="portfolio-save"');
  expect(at).toBeGreaterThan(-1);
  const tag = markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at));
  return tag.includes('aria-disabled="true"');
};

describe("weight arithmetic", () => {
  it("treats a half-typed weight as zero rather than NaN", () => {
    /*
     * 输入框清空的一瞬间值是空串。parseFloat 给的是 NaN，直接加进去会让整个
     * 合计变成 NaN——界面上显示「NaN%」，而用户只是删了一个数字。
     */
    expect(
      totalWeight([holding("sh600519", ""), holding("sz000001", "40")]),
    ).toBe(40);
  });

  it("accepts a total that is 100 within the server's tolerance", () => {
    expect(
      canSave("稳一点", [
        holding("sh600519", "33.33"),
        holding("sz000001", "33.33"),
        holding("sh601398", "33.34"),
      ]),
    ).toBe(true);
  });

  it("refuses a total that is not 100", () => {
    expect(canSave("稳一点", [holding("sh600519", "97")])).toBe(false);
  });

  it("refuses a holding with no weight at all", () => {
    expect(
      canSave("稳一点", [holding("sh600519", "100"), holding("sz000001", "")]),
    ).toBe(false);
  });

  it("refuses an unnamed portfolio", () => {
    expect(canSave("   ", [holding("sh600519", "100")])).toBe(false);
  });
});

describe("portfolio composer", () => {
  it("says how far the weights are from 100 before you submit", () => {
    const markup = render({
      holdings: [holding("sh600519", "60")],
      name: "稳一点",
    });

    expect(markup).toContain("60.00%");
    expect(markup).toContain("还差 40.00 个百分点");
    expect(saveDisabled(markup)).toBe(true);
  });

  it("enables saving once the numbers add up", () => {
    const markup = render({
      holdings: [holding("sh600519", "60"), holding("sz000001", "40")],
      name: "稳一点",
    });

    expect(markup).not.toContain("还差");
    expect(saveDisabled(markup)).toBe(false);
  });

  it("leaves out instruments with no in-app code", () => {
    /*
     * 加进来也算不出行情，这个组合的收益会永远显示「—」——而用户不会知道是
     * 哪一只拖累的。
     */
    const markup = render({
      picking: true,
      query: "测试",
      results: [
        {
          code: "600519",
          href: "/instruments/sh600519",
          kind: "沪A",
          name: "贵州茅台",
          symbol: "sh600519",
        },
        {
          code: "999999",
          href: null,
          kind: "其他",
          name: "无页品种",
          symbol: null,
        },
      ],
    });

    expect(markup).toContain("贵州茅台");
    expect(markup).not.toContain("无页品种");
  });
});
