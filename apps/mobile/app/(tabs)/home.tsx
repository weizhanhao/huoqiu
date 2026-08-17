import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";

import {
  fetchEtfList,
  fetchFundList,
  fetchHotBoard,
  fetchLiveNews,
  fetchPrivateFundManagers,
  fetchVideos,
  fetchWatchlist,
  setWatchlisted,
  type EtfRow,
  type FundRow,
  type PrivateFundManager,
} from "../../src/api/market-api";
import type { ApiResult } from "../../src/api/request";
import {
  isEtfPost,
  isFundPost,
  isPrivateFundPost,
  type ChannelIndex,
} from "@huoqiu/domain/social/post-channel";

import {
  fetchPublicPosts,
  fetchTopics,
  type SocialPost,
} from "../../src/api/social-api";
import {
  HotChannel,
  NewsChannel,
  PostChannel,
  StarChannel,
  VideoChannel,
  WatchlistChannel,
} from "../../src/components/channels/channel-views";
import { FollowFeed } from "../../src/components/follow/follow-feed";
import { AppHeader } from "../../src/components/shell/app-header";
import {
  ChannelBar,
  type ChannelId,
} from "../../src/components/shell/channel-bar";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 首页（火球页签）。
 *
 * 参考图里这一页是：蓝色头部 + 可管理的频道条 + 当前频道的内容。此前只有一条
 * 关注流，频道一个都没有——而频道正是这一页的骨架。
 *
 * 十个频道分三类：
 *   - 关注：登录用户关注对象发的帖子
 *   - 热门 / 视频 / 自选 / 资讯 / 达人：各有自己的版面
 *   - 推荐 / 基金 / ETF / 私募：帖子流。推荐是全量，另外三个按正文里引用到的
 *     真实代码和名称归类（见 @huoqiu/domain/social/post-channel）
 *
 * 三张名单只在切到那三个频道时才取：它们各是一次上游请求，而大多数人进来
 * 只看关注和推荐，没必要为了没打开的频道先跑三趟。
 */

const DEFAULT_CHANNELS: readonly ChannelId[] = [
  "follow",
  "recommend",
  "hot",
  "video",
  "watchlist",
  "fund",
  "news",
  "star",
  "private",
  "etf",
];

export default function HomeScreen() {
  const router = useRouter();
  const { fail, inform, show } = useComingSoon();
  const {
    account,
    accounts,
    callAs,
    failure,
    following,
    loading,
    posts,
    refresh,
    toggleFollow,
  } = useAccountSession();

  const [channel, setChannel] = useState<ChannelId>("follow");
  const [selected, setSelected] =
    useState<readonly ChannelId[]>(DEFAULT_CHANNELS);
  const [managing, setManaging] = useState(false);

  /* 发完帖 router.back() 回到这里，新那条要在。 */
  const publicPosts = useRemote(fetchPublicPosts, { refreshOnFocus: true });
  const hot = useRemote(useCallback(() => fetchHotBoard("gainers"), []));
  const news = useRemote(fetchLiveNews);
  const videos = useRemote(fetchVideos);
  const topics = useRemote(fetchTopics);
  const watchlist = useRemote(
    useCallback(() => callAs(fetchWatchlist), [callAs]),
  );

  /*
   * 三张归类名单。
   *
   * 只在切到对应频道时才真去取——每张都是一次上游请求，而大多数人进来只看
   * 关注和推荐。没打开的频道先跑三趟，只是让首屏更慢。
   */
  const needsIndex =
    channel === "fund" || channel === "etf" || channel === "private";
  const etfs = useRemote(
    useCallback(
      (): Promise<ApiResult<readonly EtfRow[]>> =>
        channel === "etf"
          ? fetchEtfList()
          : Promise.resolve({ kind: "ok", value: [] }),
      [channel],
    ),
  );
  const funds = useRemote(
    useCallback(
      (): Promise<ApiResult<readonly FundRow[]>> =>
        channel === "fund"
          ? fetchFundList("index", "day")
          : Promise.resolve({ kind: "ok", value: [] }),
      [channel],
    ),
  );
  const managers = useRemote(
    useCallback(
      (): Promise<ApiResult<readonly PrivateFundManager[]>> =>
        channel === "private"
          ? fetchPrivateFundManagers()
          : Promise.resolve({ kind: "ok", value: [] }),
      [channel],
    ),
  );

  const index: ChannelIndex = {
    etfCodes: new Set((etfs.value ?? []).map((row) => row.code)),
    fundCodes: new Set((funds.value ?? []).map((row) => row.code)),
    fundNames: (funds.value ?? []).map((row) => row.name),
    privateNames: (managers.value ?? []).map((row) => row.name),
  };

  /*
   * 名单还没到手时不筛。
   *
   * 空名单筛出来的必然是空列表，而界面会把它说成「还没有基金相关的讨论」——
   * 那是一句错话：不是没有，是还没查。
   */
  const indexLoading =
    needsIndex && (etfs.value === null || funds.value === null || managers.value === null);

  const channelPosts = (
    all: readonly SocialPost[] | null,
    matches: (body: string, of: ChannelIndex) => boolean,
  ): readonly SocialPost[] | null =>
    all === null || indexLoading
      ? null
      : all.filter((post) => matches(post.body, index));

  const refreshAll = useCallback(() => {
    void refresh();
    publicPosts.refresh();
    hot.refresh();
  }, [hot, publicPosts, refresh]);

  const openInstrument = useCallback(
    (href: string) => {
      /* 服务端给的是站内地址 /instruments/<code>，取最后一段做参数。 */
      const listingId = href.split("/").pop() ?? "";
      if (listingId.length === 0) return;
      router.push({
        params: { listingId },
        pathname: "/instrument/[listingId]",
      });
    },
    [router],
  );

  const addToWatchlist = useCallback(
    async (code: string, href: string) => {
      const symbol = href.split("/").pop() ?? code;
      const result = await callAs((token) =>
        setWatchlisted(token, symbol, true),
      );
      if (result.kind === "ok") {
        watchlist.refresh();
        inform("已加自选", `${code} 已加进自选，在「自选」页签里能看到。`);
        return;
      }
      fail("加自选没成功", result.message);
    },
    [callAs, fail, inform, watchlist],
  );

  const postFeed = (
    emptyText: string,
    shown: readonly SocialPost[] | null = publicPosts.value,
  ) => (
    <PostChannel
      accounts={accounts}
      emptyText={emptyText}
      failure={publicPosts.failure}
      following={following}
      loading={publicPosts.loading}
      onAddToWatchlist={(symbol, label) => {
        void addToWatchlist(label, `/instruments/${symbol}`);
      }}
      onOpenInstrument={(symbol) => {
        openInstrument(`/instruments/${symbol}`);
      }}
      onOpenPost={(postId) => {
        router.push({ params: { postId }, pathname: "/post/[postId]" });
      }}
      onShowNotice={show}
      onToggleFollow={(authorId) => {
        void toggleFollow(authorId).then((message) => {
          if (message !== null) fail("关注没成功", message);
        });
      }}
      posts={shown}
      signedIn={account !== null}
      topics={topics.value ?? []}
      viewerId={account?.id ?? null}
    />
  );

  return (
    <View style={{ backgroundColor: tokens.surface.canvas, flex: 1 }}>
      <AppHeader
        hotQuery={news.value?.[0]?.title ?? null}
        onAskAi={() => {
          show("问AI", "对话式行情问答。这一块还没做。");
        }}
        onOpenMessages={() => router.push("/messages")}
        onOpenPublish={() => router.push("/compose")}
        onOpenSearch={() => router.push("/search")}
      />

      <ChannelBar
        active={channel}
        managing={managing}
        onChangeSelected={(next) => {
          setSelected(next);
          /* 当前频道被移除了就退回关注，否则页面会停在一个已经不存在的档上。 */
          if (!next.includes(channel)) setChannel("follow");
        }}
        onCloseManager={() => {
          setManaging(false);
        }}
        onOpenManager={() => {
          setManaging(true);
        }}
        onSelect={setChannel}
        selected={selected}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl onRefresh={refreshAll} refreshing={loading} />
        }
        style={{ flex: 1 }}
      >
        {channel === "follow" ? (
          <FollowFeed
            failure={failure}
            following={following}
            loading={loading}
            onOpenPost={(postId) => {
              router.push({ params: { postId }, pathname: "/post/[postId]" });
            }}
            onOpenUser={(accountId) => {
              router.push({
                params: { accountId },
                pathname: "/user/[accountId]",
              });
            }}
            onRefresh={refreshAll}
            posts={posts}
            signedIn={account !== null}
          />
        ) : null}

        {channel === "hot" ? (
          <HotChannel
            hot={hot.value}
            hotFailure={hot.failure}
            news={news.value}
            onOpenInstrument={openInstrument}
            onOpenNews={(item) => {
              void Linking.openURL(item.href);
            }}
            topics={topics.value}
          />
        ) : null}

        {channel === "video" ? (
          <VideoChannel
            failure={videos.failure}
            onOpen={(video) => {
              void Linking.openURL(video.href);
            }}
            videos={videos.value}
          />
        ) : null}

        {channel === "watchlist" ? (
          <WatchlistChannel
            hot={hot.value}
            onAdd={(code, href) => {
              void addToWatchlist(code, href);
            }}
            onOpenInstrument={openInstrument}
            signedIn={account !== null}
            symbols={watchlist.value ?? []}
          />
        ) : null}

        {channel === "news" ? (
          <NewsChannel
            failure={news.failure}
            news={news.value}
            onOpen={(item) => {
              void Linking.openURL(item.href);
            }}
          />
        ) : null}

        {channel === "star" ? (
          <StarChannel
            accounts={accounts}
            onOpenUser={(accountId) => {
              router.push({
                params: { accountId },
                pathname: "/user/[accountId]",
              });
            }}
          />
        ) : null}

        {channel === "recommend" ? postFeed("还没有人发过内容。") : null}
        {channel === "fund"
          ? postFeed(
              "还没有基金相关的讨论。在帖子里写上基金代码或名字，就会出现在这里。",
              channelPosts(publicPosts.value, isFundPost),
            )
          : null}
        {channel === "private"
          ? postFeed(
              "还没有私募相关的讨论。在帖子里写上管理人名称，就会出现在这里。",
              channelPosts(publicPosts.value, isPrivateFundPost),
            )
          : null}
        {channel === "etf"
          ? postFeed(
              "还没有 ETF 相关的讨论。在帖子里引用一只 ETF，就会出现在这里。",
              channelPosts(publicPosts.value, isEtfPost),
            )
          : null}
      </ScrollView>
    </View>
  );
}
