import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MentionAccount } from "@huoqiu/domain/social/post-body";

import type { HotRow, NewsItem, VideoItem } from "../../api/market-api";
import type { AccountSummary, SocialPost } from "../../api/social-api";
import { appTouchMinimum } from "../../styles/app-touch";
import { signColor, signedPercent } from "../../styles/market-sign";
import { PostCard } from "../feed/post-card";

/*
 * 各频道的正文。
 *
 * 放在一个文件里是因为它们是同一件东西的几个变体——「首页某个频道显示什么」。
 * 拆成六个文件会得到六份几乎一样的空态与失败态样板。
 *
 * 共同的一条：取不到就说取不到，不要显示成「没有内容」。这两件事在用户那里
 * 会导向完全不同的下一步。
 */

export const Notice = ({ text }: Readonly<{ text: string }>) => (
  <View style={styles.notice}>
    <Text style={styles.noticeText}>{text}</Text>
  </View>
);

export const SectionTitle = ({
  subtitle,
  title,
}: Readonly<{ subtitle?: string; title: string }>) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle === undefined ? null : (
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    )}
  </View>
);

/* ---------------------------------------------------------------- 帖子频道 */

export type PostChannelProperties = Readonly<{
  accounts: readonly MentionAccount[];
  emptyText: string;
  failure: string | null;
  following: readonly string[];
  loading: boolean;
  onAddToWatchlist: (symbol: string, label: string) => void;
  onOpenInstrument: (symbol: string) => void;
  onOpenPost: (postId: string) => void;
  onShowNotice: (title: string, detail: string) => void;
  onToggleFollow: (authorId: string) => void;
  posts: readonly SocialPost[] | null;
  signedIn: boolean;
  topics: readonly string[];
  viewerId: string | null;
}>;

export function PostChannel({
  accounts,
  emptyText,
  failure,
  following,
  loading,
  onAddToWatchlist,
  onOpenInstrument,
  onOpenPost,
  onShowNotice,
  onToggleFollow,
  posts,
  signedIn,
  topics,
  viewerId,
}: PostChannelProperties) {
  if (failure !== null) return <Notice text={failure} />;
  if (posts === null) {
    return (
      <Notice text={loading ? "正在读取……" : "还没有取到内容，下拉重试。"} />
    );
  }
  if (posts.length === 0) return <Notice text={emptyText} />;

  return (
    <View style={styles.stream}>
      {posts.map((post) => (
        <PostCard
          accounts={accounts}
          following={
            /* 自己的帖子和未登录都不显示关注按钮——点了也没有意义。 */
            !signedIn || post.authorId === viewerId
              ? null
              : following.includes(post.authorId)
          }
          key={post.id}
          onAddToWatchlist={onAddToWatchlist}
          onOpen={() => {
            onOpenPost(post.id);
          }}
          onOpenInstrument={onOpenInstrument}
          onShowActionNotice={onShowNotice}
          onToggleFollow={() => {
            onToggleFollow(post.authorId);
          }}
          post={post}
          topics={topics}
        />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- 热门频道 */

export type HotChannelProperties = Readonly<{
  hot: readonly HotRow[] | null;
  hotFailure: string | null;
  news: readonly NewsItem[] | null;
  onOpenInstrument: (href: string) => void;
  onOpenNews: (item: NewsItem) => void;
  topics: readonly string[] | null;
}>;

export function HotChannel({
  hot,
  hotFailure,
  news,
  onOpenInstrument,
  onOpenNews,
  topics,
}: HotChannelProperties) {
  return (
    <View style={styles.stream}>
      <View style={styles.block}>
        <SectionTitle subtitle="7x24 快讯" title="快讯" />
        {news === null || news.length === 0 ? (
          <Notice text="还没有取到快讯。" />
        ) : (
          news.slice(0, 3).map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => {
                onOpenNews(item);
              }}
              style={styles.newsRow}
            >
              <Text numberOfLines={1} style={styles.newsTitle}>
                {item.title}
              </Text>
              {/* 上游给的是 "YYYY-MM-DD HH:mm"，这里只留时分。 */}
              <Text style={styles.newsTime}>{item.publishedAt.slice(11)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.block}>
        <SectionTitle subtitle="沪深涨幅前列" title="热股" />
        {hotFailure !== null ? (
          <Notice text={hotFailure} />
        ) : hot === null || hot.length === 0 ? (
          <Notice text="还没有取到热股榜。" />
        ) : (
          <View style={styles.heat}>
            {hot.slice(0, 6).map((row) => (
              <Pressable
                accessibilityRole="button"
                key={row.code}
                onPress={() => {
                  onOpenInstrument(row.href);
                }}
                style={styles.heatCell}
              >
                <Text numberOfLines={1} style={styles.heatName}>
                  {row.name}
                </Text>
                <Text
                  style={[
                    styles.heatPct,
                    { color: signColor(row.changePercent) },
                  ]}
                >
                  {signedPercent(row.changePercent)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.block}>
        <SectionTitle title="热门话题" />
        {topics === null || topics.length === 0 ? (
          <Notice text="还没有取到话题。" />
        ) : (
          topics.slice(0, 6).map((topic) => (
            <View key={topic} style={styles.topicRow}>
              <Text style={styles.topicHash}>#</Text>
              <Text numberOfLines={1} style={styles.topicName}>
                {topic}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- 视频频道 */

export function VideoChannel({
  failure,
  onOpen,
  videos,
}: Readonly<{
  failure: string | null;
  onOpen: (video: VideoItem) => void;
  videos: readonly VideoItem[] | null;
}>) {
  if (failure !== null) return <Notice text={failure} />;
  if (videos === null || videos.length === 0) {
    return <Notice text="还没有取到视频。" />;
  }

  return (
    <View style={styles.stream}>
      {videos.slice(0, 20).map((video) => (
        <Pressable
          accessibilityRole="button"
          key={video.code}
          onPress={() => {
            onOpen(video);
          }}
          style={styles.videoCard}
        >
          <Text style={styles.videoColumn}>{video.column}</Text>
          <Text style={styles.videoTitle}>{video.title}</Text>
          <Text style={styles.videoMeta}>{video.publishedAt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------- 自选频道 */

export function WatchlistChannel({
  hot,
  onAdd,
  onOpenInstrument,
  signedIn,
  symbols,
}: Readonly<{
  hot: readonly HotRow[] | null;
  onAdd: (code: string, href: string) => void;
  onOpenInstrument: (href: string) => void;
  signedIn: boolean;
  symbols: readonly string[];
}>) {
  return (
    <View style={styles.stream}>
      <View style={styles.block}>
        <SectionTitle title="自选频道" />
        <Text style={styles.blockLede}>
          {signedIn
            ? `你已经加了 ${String(symbols.length)} 只自选。这里会显示它们的资讯与讨论。`
            : "登录后，这里会显示你加了自选的股票、基金的最新资讯与讨论。"}
        </Text>
      </View>

      <View style={styles.block}>
        <SectionTitle subtitle="从涨幅前列里挑" title="高人气股票" />
        {hot === null || hot.length === 0 ? (
          <Notice text="还没有取到榜单。" />
        ) : (
          hot.slice(0, 5).map((row) => (
            <View key={row.code} style={styles.pickRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onOpenInstrument(row.href);
                }}
                style={styles.pickMain}
              >
                <Text style={styles.pickName}>{row.name}</Text>
                <Text style={styles.pickCode}>{row.code}</Text>
              </Pressable>
              <Text
                style={[
                  styles.pickPct,
                  { color: signColor(row.changePercent) },
                ]}
              >
                {signedPercent(row.changePercent)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onAdd(row.code, row.href);
                }}
                style={styles.pickAdd}
              >
                <Text style={styles.pickAddText}>加自选</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- 资讯频道 */

export function NewsChannel({
  failure,
  news,
  onOpen,
}: Readonly<{
  failure: string | null;
  news: readonly NewsItem[] | null;
  onOpen: (item: NewsItem) => void;
}>) {
  if (failure !== null) return <Notice text={failure} />;
  if (news === null || news.length === 0) {
    return <Notice text="还没有取到资讯。" />;
  }

  /*
   * 资讯频道放的是真实财经快讯，不是用户帖子。
   *
   * 参考图里这个频道混着 7X24 快讯与资讯稿；我们有真实的快讯源，就用它，
   * 而不是把用户帖子按关键词猜成「资讯」——猜出来的分类看着像，其实是错的。
   */
  return (
    <View style={styles.stream}>
      {news.slice(0, 30).map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item.id}
          onPress={() => {
            onOpen(item);
          }}
          style={styles.newsCard}
        >
          <View style={styles.newsHead}>
            <Text style={styles.newsBadge}>7X24 快讯</Text>
            <Text style={styles.newsTime}>{item.publishedAt}</Text>
          </View>
          <Text style={styles.newsCardTitle}>{item.title}</Text>
          <Text numberOfLines={4} style={styles.newsDigest}>
            {item.digest}
          </Text>
          <Text style={styles.newsSource}>点击查看原文</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- 达人频道 */

export function StarChannel({
  accounts,
  onOpenUser,
}: Readonly<{
  accounts: readonly AccountSummary[];
  onOpenUser: (accountId: string) => void;
}>) {
  /*
   * 我们没有认证体系，所以「达人」按真实数据排：先看粉丝数，再看发帖数。
   *
   * 参考图里那是雪球的认证创作者。凭空造一个认证标记，等于给用户一个我们
   * 根本没有做过的审核背书。
   */
  const ranked = [...accounts]
    .filter((account) => account.postCount > 0)
    .sort(
      (left, right) =>
        right.followerCount - left.followerCount ||
        right.postCount - left.postCount,
    )
    .slice(0, 20);

  if (ranked.length === 0) {
    return <Notice text="还没有人发过内容，榜单是空的。" />;
  }

  return (
    <View style={styles.stream}>
      <View style={styles.block}>
        <SectionTitle subtitle="按粉丝数、发帖数排" title="活跃作者" />
        <Text style={styles.blockLede}>
          本站没有认证体系，这里按真实数据排序，不代表任何背书。
        </Text>
      </View>
      {ranked.map((account, index) => (
        <Pressable
          accessibilityRole="button"
          key={account.id}
          onPress={() => {
            onOpenUser(account.id);
          }}
          style={styles.starRow}
        >
          <Text style={styles.starRank}>{index + 1}</Text>
          <View style={styles.starAvatar}>
            <Text style={styles.starAvatarText}>
              {account.displayName.slice(0, 1)}
            </Text>
          </View>
          <View style={styles.starMain}>
            <Text numberOfLines={1} style={styles.starName}>
              {account.displayName}
            </Text>
            <Text style={styles.starMeta}>
              粉丝 {account.followerCount} · 帖子 {account.postCount}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: tokens.surface.base,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  blockLede: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 22,
  },
  heat: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heatCell: {
    backgroundColor: tokens.market.upSubtle,
    borderRadius: 8,
    flexBasis: "31%",
    flexGrow: 1,
    gap: 2,
    minHeight: 56,
    padding: 10,
  },
  heatName: {
    color: tokens.text.primary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  heatPct: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  newsBadge: {
    backgroundColor: tokens.market.warningSubtle,
    borderRadius: 4,
    color: tokens.market.warningText,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newsCard: {
    backgroundColor: tokens.surface.base,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  newsCardTitle: {
    color: tokens.text.primary,
    fontSize: 16.5,
    fontWeight: "700",
    lineHeight: 25,
  },
  newsDigest: {
    color: tokens.text.secondary,
    fontSize: 14.5,
    lineHeight: 23,
  },
  newsHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  newsSource: {
    color: tokens.text.link,
    fontSize: 13,
  },
  starAvatar: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  starAvatarText: {
    color: tokens.brand.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  starMain: {
    flex: 1,
    gap: 2,
  },
  starMeta: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  starName: {
    color: tokens.text.primary,
    fontSize: 15.5,
    fontWeight: "600",
  },
  starRank: {
    color: tokens.text.tertiary,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    width: 20,
  },
  starRow: {
    alignItems: "center",
    backgroundColor: tokens.surface.base,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  newsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 40,
  },
  newsTime: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  newsTitle: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 14.5,
  },
  notice: {
    backgroundColor: tokens.surface.subtle,
    borderRadius: 12,
    margin: 16,
    padding: 16,
  },
  noticeText: {
    color: tokens.text.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  pickAdd: {
    alignItems: "center",
    backgroundColor: tokens.brand.subtle,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  pickAddText: {
    color: tokens.brand.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  pickCode: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  pickMain: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: appTouchMinimum,
  },
  pickName: {
    color: tokens.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  pickPct: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    marginRight: 10,
  },
  pickRow: {
    alignItems: "center",
    borderBottomColor: tokens.border.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 6,
  },
  sectionHead: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
  },
  sectionSubtitle: {
    color: tokens.text.tertiary,
    fontSize: 12.5,
  },
  sectionTitle: {
    color: tokens.text.primary,
    fontSize: 17,
    fontWeight: "700",
  },
  stream: {
    gap: 8,
  },
  topicHash: {
    color: tokens.brand.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  topicName: {
    color: tokens.text.primary,
    flex: 1,
    fontSize: 14.5,
  },
  topicRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 36,
  },
  videoCard: {
    backgroundColor: tokens.surface.base,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  videoColumn: {
    color: tokens.brand.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  videoMeta: {
    color: tokens.text.tertiary,
    fontSize: 12,
  },
  videoTitle: {
    color: tokens.text.primary,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
});
