import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";

import {
  fetchAnnouncements,
  fetchChart,
  fetchInstrumentLive,
  fetchRelatedEtfs,
  fetchWatchlist,
  setWatchlisted,
  type ChartPeriod,
} from "../../src/api/market-api";
import { fetchPublicPosts } from "../../src/api/social-api";
import {
  InstrumentScreen as InstrumentView,
  type InstrumentTab,
} from "../../src/components/instrument/instrument-screen";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 个股页。
 *
 * 此前这一页读的是 D0 夹具——只有一只写死的「星海智造」，别的代码点进来是
 * 空的。现在按地址里的代码现取：报价、图形、公告、相关 ETF 都是真的。
 */
export default function InstrumentScreen() {
  const router = useRouter();
  const { fail, show } = useComingSoon();
  const { callAs } = useAccountSession();
  const parameters = useLocalSearchParams<{ listingId?: string | string[] }>();
  const onBack = createD0BackHandler(router);

  const listingId = Array.isArray(parameters.listingId)
    ? parameters.listingId[0]
    : parameters.listingId;
  const symbol = (listingId ?? "").toLowerCase();

  const [period, setPeriod] = useState<ChartPeriod>("intraday");
  const [tab, setTab] = useState<InstrumentTab>("discussion");

  const live = useRemote(
    useCallback(() => fetchInstrumentLive(symbol), [symbol]),
  );
  const chart = useRemote(
    useCallback(() => fetchChart(symbol, period), [period, symbol]),
  );
  const announcements = useRemote(
    useCallback(() => fetchAnnouncements(symbol), [symbol]),
  );
  const etfs = useRemote(useCallback(() => fetchRelatedEtfs(symbol), [symbol]));
  const posts = useRemote(fetchPublicPosts);
  const watchlist = useRemote(
    useCallback(() => callAs(fetchWatchlist), [callAs]),
    { refreshOnFocus: true },
  );

  /*
   * 讨论按正文里提到的代码筛。
   *
   * 服务端没有「帖子↔标的」的关联表，但发帖器写进正文的记号里带着代码
   * （$名称(SH600519)$），大小写不敏感地找它就够了——这也比另建一张表更贴近
   * 事实：帖子确实提到了它，才算讨论了它。
   */
  const discussions = (posts.value ?? []).filter((post) =>
    post.body.toLowerCase().includes(`(${symbol})`),
  );

  const watchlisted = (watchlist.value ?? []).includes(symbol);

  const toggleWatchlist = useCallback(async () => {
    const result = await callAs((token) =>
      setWatchlisted(token, symbol, !watchlisted),
    );
    if (result.kind === "ok") {
      watchlist.refresh();
      return;
    }
    fail(watchlisted ? "移出自选没成功" : "加自选没成功", result.message);
  }, [callAs, fail, symbol, watchlist, watchlisted]);

  return (
    <InstrumentView
      announcements={announcements.value}
      announcementsFailure={announcements.failure}
      chart={chart.value}
      chartFailure={chart.failure}
      chartLoading={chart.loading}
      discussions={posts.value === null ? null : discussions}
      etfs={etfs.value}
      etfsFailure={etfs.failure}
      metrics={live.value?.metrics}
      onBack={onBack}
      onCompose={() => {
        router.push({
          params: { name: live.value?.quote.name ?? symbol, symbol },
          pathname: "/compose",
        });
      }}
      onOpenAnnouncement={(item) => {
        void Linking.openURL(item.href);
      }}
      onOpenEtf={(href) => {
        const next = href.split("/").pop() ?? "";
        if (next.length === 0 || next === symbol) return;
        router.push({
          params: { listingId: next },
          pathname: "/instrument/[listingId]",
        });
      }}
      onOpenPost={(id) => {
        router.push({ params: { postId: id }, pathname: "/post/[postId]" });
      }}
      onSelectPeriod={setPeriod}
      onSelectTab={setTab}
      onShowNotice={show}
      onToggleWatchlist={() => {
        void toggleWatchlist();
      }}
      period={period}
      quote={live.value?.quote ?? null}
      quoteFailure={live.failure}
      symbol={symbol}
      tab={tab}
      watchlisted={watchlisted}
    />
  );
}
