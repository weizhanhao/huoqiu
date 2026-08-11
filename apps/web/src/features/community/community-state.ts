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
export type CommunityContentOrigin = "fixed-synthetic" | "session-local";

export type CommunityReply = Readonly<{
  author: string;
  body: string;
  id: string;
  likes: number;
  origin: CommunityContentOrigin;
  time: string;
}>;

export type CommunityComment = Readonly<{
  author: string;
  body: string;
  id: string;
  likes: number;
  origin: CommunityContentOrigin;
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

type FixedCommunityReply = Omit<CommunityReply, "origin">;
type FixedCommunityComment = Omit<CommunityComment, "origin" | "replies"> &
  Readonly<{ replies: readonly FixedCommunityReply[] }>;

const fixedComments: readonly FixedCommunityComment[] = [
  {
    author: "静观样本",
    body: "我更在意估值假设有没有随着经营数据更新。",
    id: "comment_syn_0001",
    replies: [
      {
        author: "火球演示用户",
        body: "同意，假设变化时先记下原因会更清楚。",
        id: "reply_syn_0001",
        likes: 21,
        time: "今天 10:18",
      },
      {
        author: "问题清单",
        body: "还可以补一栏：什么证据出现时必须重新检查假设。",
        id: "reply_syn_0002",
        likes: 16,
        time: "今天 10:24",
      },
    ],
    likes: 52,
    time: "今天 10:12",
  },
  {
    author: "组合练习生",
    body: "谢谢分享，已把这组观察加入自己的研究清单。",
    id: "comment_syn_0002",
    likes: 34,
    replies: [
      {
        author: "北岸观察员",
        body: "欢迎只取模板，所有案例都是固定合成内容。",
        id: "reply_syn_0003",
        likes: 12,
        time: "今天 09:58",
      },
    ],
    time: "今天 09:46",
  },
  {
    author: "慢变量笔记",
    body: "我会把判断变化的日期也记下来，避免只保留最后一个版本。",
    id: "comment_syn_0003",
    likes: 47,
    replies: [
      {
        author: "静观样本",
        body: "版本线很重要，否则回看时容易忽略当时的信息条件。",
        id: "reply_syn_0004",
        likes: 18,
        time: "今天 09:31",
      },
    ],
    time: "今天 09:22",
  },
  {
    author: "研究练习社",
    body: "反例最好写成可观察条件，而不是一句笼统的“也可能不对”。",
    id: "comment_syn_0004",
    likes: 61,
    replies: [
      {
        author: "问题清单",
        body: "赞同，明确条件之后讨论才有继续推进的空间。",
        id: "reply_syn_0005",
        likes: 24,
        time: "今天 09:12",
      },
    ],
    time: "今天 09:06",
  },
  {
    author: "离线影像间",
    body: "详情页段落和评论层级很适合用来检查长内容在小屏上的阅读节奏。",
    id: "comment_syn_0005",
    likes: 29,
    replies: [
      {
        author: "火球演示用户",
        body: "后续还可以继续验证键盘操作和更长回复的换行。",
        id: "reply_syn_0006",
        likes: 9,
        time: "昨天 23:48",
      },
    ],
    time: "昨天 23:40",
  },
  {
    author: "证据整理员",
    body: "风险提示和合成标识放在正文附近，比只在页面底部说明更容易看到。",
    id: "comment_syn_0006",
    likes: 38,
    replies: [],
    time: "昨天 22:56",
  },
  {
    author: "样本观察者",
    body: "固定时间、作者和互动数让每次测试结果都能重复核对。",
    id: "comment_syn_0007",
    likes: 26,
    replies: [],
    time: "昨天 22:18",
  },
];

const initialComments: readonly CommunityComment[] = fixedComments.map(
  (comment) => ({
    ...comment,
    origin: "fixed-synthetic",
    replies: comment.replies.map((reply) => ({
      ...reply,
      origin: "fixed-synthetic",
    })),
  }),
);

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
        likes: 0,
        origin: "session-local",
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
                likes: 0,
                origin: "session-local",
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
