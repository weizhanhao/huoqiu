import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { setWatchlisted } from "../../src/api/market-api";
import {
  fetchComments,
  fetchPublicPosts,
  fetchTopics,
  publishComment,
  setBookmarked,
  setLiked,
  type PostComment,
} from "../../src/api/social-api";
import { PostDetailScreen } from "../../src/components/post/post-detail-screen";
import { useComingSoon } from "../../src/components/system/coming-soon";
import { useRemote } from "../../src/hooks/use-remote";
import { createD0BackHandler } from "../../src/navigation/back-or-home";
import { useAccountSession } from "../../src/session/account-session";

/*
 * 帖子详情。
 *
 * 帖子本身从公开列表里按 id 挑出来——服务端没有单条帖子的接口，而这份列表
 * 首页已经在取。评论另取：它才是这一页会变的部分，发完一条要立刻看到自己那句。
 *
 * 赞和收藏的当前状态来自会话快照，不在这一页本地记。本地记的话，退出再进来
 * 就回到「没赞过」，而服务端明明记着——用户以为刚才那下没生效，再点一次，
 * 正好把赞取消掉。
 */
export default function PostDetailRoute() {
  const router = useRouter();
  const { show } = useComingSoon();
  const {
    account,
    accounts,
    bookmarkedPostIds,
    callAs,
    following,
    likedPostIds,
    refresh,
    toggleFollow,
  } = useAccountSession();
  const parameters = useLocalSearchParams<{ postId?: string | string[] }>();
  const onBack = createD0BackHandler(router);

  const postId = Array.isArray(parameters.postId)
    ? parameters.postId[0]
    : parameters.postId;
  const id = postId ?? "";

  const posts = useRemote(fetchPublicPosts);
  const topics = useRemote(fetchTopics);
  const comments = useRemote(useCallback(() => fetchComments(id), [id]));

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [sending, setSending] = useState(false);

  const post = (posts.value ?? []).find((entry) => entry.id === id) ?? null;
  const liked = likedPostIds.includes(id);
  const bookmarked = bookmarkedPostIds.includes(id);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    const result = await callAs((token) =>
      publishComment(token, id, text, replyTo?.id ?? null),
    );
    setSending(false);
    if (result.kind === "ok") {
      /* 先清空再刷新：留着草稿会让人以为没发出去，然后再发一遍。 */
      setDraft("");
      setReplyTo(null);
      comments.refresh();
      return;
    }
    show("没发出去", result.message);
  }, [callAs, comments, draft, id, replyTo, sending, show]);

  const toggleLike = useCallback(async () => {
    const result = await callAs((token) => setLiked(token, id, !liked));
    if (result.kind === "ok") {
      /* 快照给的是「我赞过没有」，列表给的是赞数，两个都要更新。 */
      await refresh();
      posts.refresh();
      return;
    }
    show(liked ? "取消赞没成功" : "点赞没成功", result.message);
  }, [callAs, id, liked, posts, refresh, show]);

  const toggleBookmark = useCallback(async () => {
    const result = await callAs((token) =>
      setBookmarked(token, id, !bookmarked),
    );
    if (result.kind === "ok") {
      await refresh();
      return;
    }
    show(bookmarked ? "取消收藏没成功" : "收藏没成功", result.message);
  }, [bookmarked, callAs, id, refresh, show]);

  const addToWatchlist = useCallback(
    async (symbol: string, label: string) => {
      const result = await callAs((token) =>
        setWatchlisted(token, symbol, true),
      );
      show(
        result.kind === "ok" ? "已加自选" : "加自选没成功",
        result.kind === "ok"
          ? `${label} 已加进自选，在「自选」页签里能看到。`
          : result.message,
      );
    },
    [callAs, show],
  );

  return (
    <PostDetailScreen
      accounts={accounts}
      bookmarked={bookmarked}
      comments={comments.value}
      commentsFailure={comments.failure}
      draft={draft}
      following={
        account === null || post === null || post.authorId === account.id
          ? null
          : following.includes(post.authorId)
      }
      likeCount={post?.likeCount ?? 0}
      liked={liked}
      onAddToWatchlist={(symbol, label) => {
        void addToWatchlist(symbol, label);
      }}
      onBack={onBack}
      onChangeDraft={setDraft}
      onOpenInstrument={(symbol) => {
        router.push({
          params: { listingId: symbol },
          pathname: "/instrument/[listingId]",
        });
      }}
      onReplyTo={setReplyTo}
      onSubmit={() => {
        void submit();
      }}
      onToggleBookmark={() => {
        void toggleBookmark();
      }}
      onToggleFollow={() => {
        if (post === null) return;
        void toggleFollow(post.authorId).then((message) => {
          if (message !== null) show("关注没成功", message);
        });
      }}
      onToggleLike={() => {
        void toggleLike();
      }}
      post={post}
      postFailure={posts.failure}
      postLoaded={posts.value !== null}
      replyTo={replyTo}
      sending={sending}
      topics={topics.value ?? []}
    />
  );
}
