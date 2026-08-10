export const communityChannels = [
  "关注",
  "热门",
  "资讯",
  "达人",
  "基金",
  "ETF",
] as const;

export type CommunityChannel = (typeof communityChannels)[number];
export type ReactionKind = "like" | "bookmark";
export type PublisherMode = "discussion" | "article";

export type CommunityReply = Readonly<{
  author: string;
  body: string;
  id: string;
  time: string;
}>;

export type CommunityComment = Readonly<{
  author: string;
  body: string;
  id: string;
  replies: readonly CommunityReply[];
  time: string;
}>;

export type CommunityState = Readonly<{
  activeChannel: CommunityChannel;
  bookmarkLabel: string;
  comments: readonly CommunityComment[];
  error: string | null;
  feedAnnouncement: string;
  followLabel: string;
  isBookmarked: boolean;
  isFollowing: boolean;
  isLiked: boolean;
  likeLabel: string;
  likes: number;
  status: string | null;
}>;

export type PublishDraftInput = Readonly<{
  body: string;
  mode: PublisherMode;
  title: string;
}>;

export type PublishDraftResult = Readonly<{
  error: string | null;
  success: string | null;
}>;

const initialComments: readonly CommunityComment[] = [
  {
    author: "静观样本",
    body: "我更在意估值假设有没有随着经营数据更新。",
    id: "comment_syn_0001",
    replies: [
      {
        author: "火球演示用户",
        body: "同意，假设变化时先记下原因会更清楚。",
        id: "reply_syn_0001",
        time: "今天 10:18",
      },
    ],
    time: "今天 10:12",
  },
  {
    author: "组合练习生",
    body: "谢谢分享，已把这组观察加入自己的研究清单。",
    id: "comment_syn_0002",
    replies: [],
    time: "今天 09:46",
  },
];

const labelsFor = (isLiked: boolean, likes: number, isBookmarked: boolean) => ({
  bookmarkLabel: isBookmarked ? "已收藏" : "收藏",
  likeLabel: `${isLiked ? "已赞" : "点赞"} ${likes}`,
});

export const createInitialCommunityState = (
  activeChannel: CommunityChannel = "关注",
): CommunityState => {
  const likes = 128;
  const isLiked = false;
  const isBookmarked = false;

  return {
    activeChannel,
    comments: initialComments,
    error: null,
    feedAnnouncement: `正在浏览${activeChannel}频道`,
    followLabel: "关注作者",
    isBookmarked,
    isFollowing: false,
    isLiked,
    likes,
    status: null,
    ...labelsFor(isLiked, likes, isBookmarked),
  };
};

export const selectChannel = (
  state: CommunityState,
  activeChannel: CommunityChannel,
): CommunityState => ({
  ...state,
  activeChannel,
  error: null,
  feedAnnouncement: `正在浏览${activeChannel}频道`,
  status: null,
});

export const toggleFollow = (state: CommunityState): CommunityState => {
  const isFollowing = !state.isFollowing;

  return {
    ...state,
    error: null,
    followLabel: isFollowing ? "已关注" : "关注作者",
    isFollowing,
    status: isFollowing ? "已关注合成作者。" : "已取消关注合成作者。",
  };
};

export const toggleReaction = (
  state: CommunityState,
  kind: ReactionKind,
): CommunityState => {
  const isLiked = kind === "like" ? !state.isLiked : state.isLiked;
  const isBookmarked =
    kind === "bookmark" ? !state.isBookmarked : state.isBookmarked;
  const likes =
    kind === "like" ? state.likes + (isLiked ? 1 : -1) : state.likes;

  return {
    ...state,
    error: null,
    isBookmarked,
    isLiked,
    likes,
    status:
      kind === "like"
        ? isLiked
          ? "已点赞本条合成帖子。"
          : "已取消点赞本条合成帖子。"
        : isBookmarked
          ? "已收藏到本次会话。"
          : "已取消收藏。",
    ...labelsFor(isLiked, likes, isBookmarked),
  };
};

const hasText = (input: string): boolean => input.trim().length > 0;

export const addComment = (
  state: CommunityState,
  body: string,
): CommunityState => {
  if (!hasText(body)) {
    return { ...state, error: "请输入评论内容后再发布。", status: null };
  }

  return {
    ...state,
    comments: [
      ...state.comments,
      {
        author: "火球演示用户",
        body: body.trim(),
        id: `comment_session_${state.comments.length + 1}`,
        replies: [],
        time: "刚刚",
      },
    ],
    error: null,
    status: "评论已添加到本次会话。",
  };
};

export const addReply = (
  state: CommunityState,
  commentId: string,
  body: string,
): CommunityState => {
  if (!hasText(body)) {
    return { ...state, error: "请输入回复内容后再发布。", status: null };
  }

  return {
    ...state,
    comments: state.comments.map((comment) =>
      comment.id === commentId
        ? {
            ...comment,
            replies: [
              ...comment.replies,
              {
                author: "火球演示用户",
                body: body.trim(),
                id: `reply_session_${comment.replies.length + 1}`,
                time: "刚刚",
              },
            ],
          }
        : comment,
    ),
    error: null,
    status: "回复已添加到本次会话。",
  };
};

export const publishDraft = ({
  body,
  mode,
  title,
}: PublishDraftInput): PublishDraftResult => {
  if (mode === "article" && !hasText(title)) {
    return { error: "请输入长文标题后再发布。", success: null };
  }

  if (!hasText(body)) {
    return {
      error:
        mode === "article"
          ? "请输入长文正文后再发布。"
          : "请输入讨论正文后再发布。",
      success: null,
    };
  }

  return { error: null, success: "合成草稿已发布到本次会话。" };
};
