import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { HotRow, NewsItem, SearchHit } from "../../../src/api/market-api";
import {
  SearchScreen,
  splitMatch,
} from "../../../src/components/search/search-screen";

/*
 * 搜索。
 *
 * 参考图两张：没输入时是「猜你想搜 + 热门股票」，输入后是联想列表，命中的
 * 那几个字标成橙色。
 */

const hit = (
  code: string,
  name: string,
  symbol: string | null = `sh${code}`,
): SearchHit => ({
  code,
  href: symbol === null ? null : `/instruments/${symbol}`,
  kind: "沪A",
  name,
  symbol,
});

const hotRow = (code: string, name: string, changePercent: number): HotRow => ({
  changePercent,
  code,
  href: `/instruments/sh${code}`,
  last: 10,
  name,
});

const news = (id: string, title: string): NewsItem => ({
  digest: title,
  href: `https://example.com/${id}`,
  id,
  publishedAt: "2026-08-17 09:30",
  title,
});

const render = (
  overrides: Partial<Parameters<typeof SearchScreen>[0]> = {},
): string =>
  renderToStaticMarkup(
    <SearchScreen
      guesses={[news("n1", "英伟达太空AI合作")]}
      hot={[hotRow("600519", "贵州茅台", 1.23)]}
      hotFailure={null}
      intraday={new Map()}
      onBack={vi.fn()}
      onChangeQuery={vi.fn()}
      onOpenHot={vi.fn()}
      onOpenNews={vi.fn()}
      onOpenSymbol={vi.fn()}
      onSubmit={vi.fn()}
      query=""
      results={null}
      resultsFailure={null}
      searching={false}
      {...overrides}
    />,
  );

describe("split match", () => {
  it("takes the matched text from the result, not from what was typed", () => {
    /*
     * 直接把输入原样标出来的话，搜 "amd" 会在「AMD」上印出小写的 amd——
     * 高亮把结果本身改写了。
     */
    expect(splitMatch("AMD", "amd")).toEqual({
      after: "",
      before: "",
      match: "AMD",
    });
  });

  it("leaves the name whole when nothing matches", () => {
    expect(splitMatch("贵州茅台", "美国")).toEqual({
      after: "",
      before: "贵州茅台",
      match: "",
    });
  });

  it("keeps the text on both sides of the match", () => {
    expect(splitMatch("美国银行", "美国")).toEqual({
      after: "银行",
      before: "",
      match: "美国",
    });
  });
});

describe("search screen", () => {
  it("shows the guesses and the hot board before anything is typed", () => {
    const markup = render();

    expect(markup).toContain("猜你想搜");
    expect(markup).toContain("英伟达太空AI合作");
    expect(markup).toContain("热门股票");
    expect(markup).toContain("贵州茅台");
  });

  it("does not say there is no such instrument while the search is running", () => {
    /*
     * 「还在搜」和「搜不到」混成一句的话，网慢时每次输入都像是没有这只股票，
     * 用户会换个词重搜，然后一直搜不到。
     */
    const running = render({ query: "美国", results: [], searching: true });
    const done = render({ query: "美国", results: [], searching: false });

    expect(running).not.toContain("没有匹配");
    expect(done).toContain("没有匹配");
  });

  it("highlights the matched characters inside the result name", () => {
    const markup = render({
      query: "美国",
      results: [hit("601988", "美国银行")],
      searching: false,
    });

    expect(markup).toContain("美国");
    expect(markup).toContain("银行");
    expect(markup).toContain("601988");
  });

  it("still lists an instrument that has no in-app page", () => {
    /*
     * 上游代码表里有一些站内渲染不出来的品种。整条藏掉，用户会以为搜不到；
     * 列出来但点不动，至少他知道有这只。
     */
    const markup = render({
      query: "测试",
      results: [hit("999999", "测试品种", null)],
      searching: false,
    });

    /* 名字被高亮切成两段，所以分开断言：命中的「测试」和其余的「品种」。 */
    expect(markup).toContain("测试");
    expect(markup).toContain("品种");
    expect(markup).not.toContain("没有匹配");
  });
});
