import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";

import {
  fetchHotBoard,
  fetchLiveNews,
  fetchVideos,
  fetchWatchlist,
  setWatchlisted,
} from "../../src/api/market-api";
import { fetchPublicPosts, fetchTopics } from "../../src/api/social-api";
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
 *   - 关注：登录用户关注对象发的帖子（原有）
 *   - 热门 / 视频 / 自选：各有自己的版面
 *   - 其余：同一份公开帖子流，换个空态文案
 *
 * 后面这一类目前不做内容分流——我们还没有把帖子归到「基金/资讯/私募/ETF」的
 * 依据。按关键词猜着分会造出一份看着像、实则错的分类，不如先都给全量，
 * 空态里说清它是什么。
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
  const { show } = useComingSoon();
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

  const publicPosts = useRemote(fetchPublicPosts);
  const hot = useRemote(useCallback(() => fetchHotBoard("gainers"), []));
  const news = useRemote(fetchLiveNews);
  const videos = useRemote(fetchVideos);
  const topics = useRemote(fetchTopics);
  const watchlist = useRemote(
    useCallback(() => callAs(fetchWatchlist), [callAs]),
  );

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
        show("已加自选", `${code} 已加进自选，在「自选」页签里能看到。`);
        return;
      }
      show("加自选没成功", result.message);
    },
    [callAs, show, watchlist],
  );

  const postFeed = (emptyText: string) => (
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
        void toggleFollow(authorId);
      }}
      posts={publicPosts.value}
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
        {channel === "fund" ? postFeed("还没有基金相关的讨论。") : null}
        {channel === "private" ? postFeed("还没有私募相关的讨论。") : null}
        {channel === "etf" ? postFeed("还没有 ETF 相关的讨论。") : null}
      </ScrollView>
    </View>
  );
}
