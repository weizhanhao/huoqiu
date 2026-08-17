import { tokens } from "@huoqiu/native-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  setLiked,
  type SocialPost,
} from "../../src/api/social-api";
import {
  EtfBoard,
  FundBoard,
  PrivateBoard,
} from "../../src/components/channels/channel-boards";
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
import {
  readChannelOrder,
  writeChannelOrder,
} from "../../src/stores/channel-preference";
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
    likedPostIds,
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

  /*
   * 把上次排好的顺序读回来。
   *
   * 只认还存在的频道 id：改版删掉某个频道之后，旧记录里那一项会渲染成一个
   * 打不开的空档。
   */
  useEffect(() => {
    let cancelled = false;
    void readChannelOrder().then((saved) => {
      if (cancelled || saved === null) return;
      const known = saved.filter((id): id is ChannelId =>
        DEFAULT_CHANNELS.includes(id as ChannelId),
      );
      if (known.length > 0) setSelected(known);
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
    needsIndex &&
    (etfs.value === null || funds.value === null || managers.value === null);

  const channelPosts = (
    all: readonly SocialPost[] | null,
    matches: (body: string, of: ChannelIndex) => boolean,
  ): readonly SocialPost[] | null =>
    all === null || indexLoading
      ? null
      : all.filter((post) => matches(post.body, index));

  const refreshAll = useCallback(() => {
    /*
     * 下拉要把这一屏能看到的都刷了。
     *
     * 此前只刷会话、帖子、热股榜——在「资讯」频道下拉，转圈转完，快讯一条
     * 没变。而 7x24 快讯恰恰是最需要刷新的内容。
     */
    void refresh();
    publicPosts.refresh();
    hot.refresh();
    news.refresh();
    videos.refresh();
    topics.refresh();
    watchlist.refresh();
  }, [hot, news, publicPosts, refresh, topics, videos, watchlist]);

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

  /*
   * 关注流空着时那块推荐位上的「关注」。
   *
   * 只走关注这一个方向：推荐位里已经把关注过的人剔掉了，所以这里按下去不可能
   * 是取消。成了之后 toggleFollow 会重新拉一遍会话，被关注的人发的帖子当场
   * 进流，推荐位自己收起来。
   */
  const follow = useCallback(
    async (accountId: string) => {
      const message = await toggleFollow(accountId);
      if (message === null) return;
      if (message === "请先登录。") {
        show("关注失败", message);
        return;
      }
      fail("关注没成功", message);
    },
    [fail, show, toggleFollow],
  );

  const toggleLike = useCallback(
    async (postId: string) => {
      const next = !likedPostIds.includes(postId);
      const result = await callAs((token) => setLiked(token, postId, next));
      if (result.kind === "ok") {
        /* 赞数在帖子列表里，我赞过没有在会话快照里，两份都要更新。 */
        void refresh();
        publicPosts.refresh();
        return;
      }
      fail(next ? "点赞没成功" : "取消赞没成功", result.message);
    },
    [callAs, fail, likedPostIds, publicPosts, refresh],
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
      onOpenUser={(accountId) => {
        router.push({ params: { accountId }, pathname: "/user/[accountId]" });
      }}
      onShowNotice={show}
      onToggleLike={(postId) => {
        void toggleLike(postId);
      }}
      likedPostIds={likedPostIds}
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
        onOpenPublish={() => {
          /*
           * 未登录先说，别让人写完再退回来。
           *
           * 此前是写完八百字、点发布、才收到一句「请先登录。」，而那一屏没有
           * 任何登录入口——关掉发帖器正文就没了。
           */
          if (account === null) {
            fail("发帖", "请先登录。");
            return;
          }
          router.push("/compose");
        }}
        onOpenSearch={() => {
          /*
           * 把搜索框里那句热搜带过去。
           *
           * 此前只 push("/search")，搜索页的输入框是空的——用户点的就是那句
           * 话，到了搜索页它却不见了。
           */
          const hot = news.value?.[0]?.title ?? "";
          router.push(
            hot.length === 0
              ? "/search"
              : { params: { q: hot }, pathname: "/search" },
          );
        }}
      />

      <ChannelBar
        active={channel}
        managing={managing}
        onChangeSelected={(next) => {
          setSelected(next);
          void writeChannelOrder(next);
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
            meId={account?.id ?? null}
            onFollow={(accountId) => {
              void follow(accountId);
            }}
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
            suggestions={accounts}
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

        {/*
          这三个频道先给名单，再给讨论。
          频道名承诺的是「这里有基金 / ETF / 私募」，不是「这里有人聊过它们」
          ——只筛帖子的话，站上没人写过基金时整屏是空的，而三张真名单一直都
          在手里。
        */}
        {channel === "fund" ? (
          <>
            <FundBoard funds={funds.value} />
            {postFeed(
              "还没有人聊过基金。在帖子里写上基金代码或名字，就会出现在这里。",
              channelPosts(publicPosts.value, isFundPost),
            )}
          </>
        ) : null}
        {channel === "private" ? (
          <>
            <PrivateBoard
              managers={managers.value}
              onOpen={(url) => {
                void Linking.openURL(url);
              }}
            />
            {postFeed(
              "还没有人聊过私募。在帖子里写上管理人名称，就会出现在这里。",
              channelPosts(publicPosts.value, isPrivateFundPost),
            )}
          </>
        ) : null}
        {channel === "etf" ? (
          <>
            <EtfBoard
              etfs={etfs.value}
              onAdd={(code, href) => {
                void addToWatchlist(code, href);
              }}
              onOpen={openInstrument}
              watchlist={watchlist.value ?? []}
            />
            {postFeed(
              "还没有人聊过 ETF。在帖子里引用一只 ETF，就会出现在这里。",
              channelPosts(publicPosts.value, isEtfPost),
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
