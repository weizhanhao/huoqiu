import type { Metadata } from "next";

import { InstrumentHits } from "../../components/instrument/instrument-hits";
import { DesktopShell } from "../../components/shell/desktop-shell";
import { GlobalSearchResults } from "../../features/search/global-search";
import { loadD0Fixture } from "../../lib/d0-fixture";
import { searchInstruments } from "../../server/search.server";

export const metadata: Metadata = {
  description: "搜索标的、基金、ETF、帖子与达人",
  title: "搜索 · 火球",
};

type SearchPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{
      fixture_state?: string | readonly string[];
      q?: string | readonly string[];
    }>
  >;
}>;

const normalizeQueryParameter = (
  value: string | readonly string[] | undefined,
): string => {
  const query = Array.isArray(value) ? value[0] : value;
  return typeof query === "string" ? query.slice(0, 128) : "";
};

export default async function SearchPage({
  searchParams,
}: SearchPageProperties) {
  const fixtureResult = loadD0Fixture();
  const resolvedSearchParameters = await searchParams;
  const query = normalizeQueryParameter(resolvedSearchParameters.q);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">搜索</h1>
      {/*
        标的结果。
        这一段此前渲染的是 D0 夹具里的虚构公司：搜「茅台」一条都搜不到，
        搜出来的是「星海智造」，点进去 404。真实的标的搜索一直都在
        （顶栏搜索框走的就是它），只是没接到这一页上。
      */}
      <InstrumentHits hits={await searchInstruments(query)} query={query} />
      <GlobalSearchResults query={query} />
    </DesktopShell>
  );
}
