import { communityFeedCards } from "../community/community-fixtures";
import { getCommunityAuthor } from "../community/community-author-fixtures";
import {
  countFollowers,
  getAccount,
  listBookmarkedPosts,
  listCommentsByAuthor,
  listFollowers,
  listFollowing,
  listPostsByAuthor,
} from "../../server/social-store";

/*
 * 按 id 取任意一个用户主页需要的全部资料。
 *
 * 站内现在有两类主体，主页必须都能打开：
 *   1. 注册账号（acct_*）——完全来自 .runtime/social 的真实记录；
 *   2. 栏目账号（author_*）——由编辑部维护的固定栏目，帖子随产品一起录入，
 *      不是运行时生成的。它们同样可以被真实账号关注，所以粉丝数
 *      = 栏目历史读者数 + 本机真实关注数。
 *
 * 这里只读，不写；也绝不读取 passwordHash / salt。
 */

export type ProfilePost = Readonly<{
  body: string;
  href: string;
  id: string;
  publishedLabel: string;
  title: string;
}>;

/** 「收藏」与「回复」两个页签的内容，与帖子同源同形。 */
export type ProfileReply = Readonly<{
  body: string;
  href: string;
  id: string;
  postTitle: string;
  publishedLabel: string;
}>;

export type ProfileView = Readonly<{
  bio: string;
  /*
   * 收藏与回复。
   *
   * 主页有这两个页签，但此前没有任何数据支撑：页签在那里，点开永远是空的。
   * 现在分别来自 bookmarks 表和 comments 表；栏目账号没有这些行为，
   * 保持空数组——空是事实，不是缺失。
   */
  bookmarks: readonly ProfilePost[];
  replies: readonly ProfileReply[];
  displayName: string;
  focus: readonly string[];
  followerCount: number;
  followingCount: number;
  id: string;
  initials: string;
  /** 注册账号为 true；编辑部栏目账号为 false。用于主页上如实标注身份。 */
  isRegisteredAccount: boolean;
  joinedLabel: string;
  postCount: number;
  posts: readonly ProfilePost[];
  role: string;
}>;

const formatDate = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const firstCharacter = (value: string): string => [...value][0] ?? "火";

const loadRegisteredProfile = (accountId: string): ProfileView | null => {
  const account = getAccount(accountId);
  if (account === null) {
    return null;
  }

  const posts = listPostsByAuthor(accountId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((post) => ({
      body: post.body,
      href: `/community/posts/${post.id}`,
      id: post.id,
      publishedLabel: formatDate(post.createdAt),
      title: post.title,
    }));

  return {
    /*
     * 用本人填写的简介。
     *
     * 这里原本是一句写死的说明——设置页明写「简介将公开显示在你的个人主页
     * 上」，而主页显示的却是同一句固定文案，改了也看不见。没填时才回落到
     * 那句说明，而不是把它当成所有人的简介。
     */
    bio:
      account.bio.length > 0
        ? account.bio
        : "这是一个在本机注册的账号。资料、帖子与关注关系都由本人操作产生。",
    bookmarks: listBookmarkedPosts(accountId).map((post) => ({
      body: post.body,
      href: `/community/posts/${post.id}`,
      id: post.id,
      publishedLabel: `${post.authorName} · ${formatDate(post.createdAt)}`,
      title: post.title,
    })),
    replies: listCommentsByAuthor(accountId).map((comment) => ({
      body: comment.body,
      // 回复要能点回原帖，否则读者不知道它在回应什么。
      href: `/community/posts/${comment.postId}`,
      id: comment.id,
      postTitle: comment.postTitle,
      publishedLabel: formatDate(comment.createdAt),
    })),
    displayName: account.displayName,
    focus: [],
    followerCount: account.followerCount,
    followingCount: account.followingCount,
    id: account.id,
    initials: firstCharacter(account.displayName),
    isRegisteredAccount: true,
    joinedLabel: `${formatDate(account.createdAt)} 注册`,
    postCount: account.postCount,
    posts,
    role: "注册用户",
  };
};

const loadColumnProfile = (authorId: string): ProfileView | null => {
  const author = getCommunityAuthor(authorId);
  if (author === undefined) {
    return null;
  }

  const posts = communityFeedCards
    .filter((card) => card.authorId === authorId)
    .map((card) => ({
      body: card.body,
      href: card.detailHref ?? `/community/posts/${card.id}`,
      id: card.id,
      publishedLabel: card.publishedLabel,
      title: card.title,
    }));

  return {
    bio: author.bio,
    /*
     * 栏目账号没有收藏和回复行为，如实给空。
     * 拿它的栏目文章去填「收藏」页签会让人以为那是它收藏的别人的内容。
     */
    bookmarks: [],
    replies: [],
    displayName: author.displayName,
    focus: author.focus,
    followerCount: author.followers + countFollowers(authorId),
    followingCount: listFollowing(authorId).length,
    id: author.id,
    initials: author.initials,
    isRegisteredAccount: false,
    joinedLabel: `${author.notes} 篇栏目记录`,
    postCount: posts.length,
    posts,
    role: author.role,
  };
};

export const loadProfile = (userId: string): ProfileView | null =>
  userId.startsWith("acct_")
    ? loadRegisteredProfile(userId)
    : loadColumnProfile(userId);

/** 供 generateStaticParams 使用：编译期已知的栏目账号。 */
export const knownColumnProfileIds = (): readonly string[] =>
  [...new Set(communityFeedCards.map((card) => card.authorId))].sort();

export type RelationKind = "followers" | "following";

export type RelationEntry = Readonly<{
  displayName: string;
  id: string;
  initials: string;
  role: string;
}>;

/*
 * 关注 / 粉丝名单。
 *
 * 名单里只放真实存在的主体：id 查不到资料的记录直接丢弃，而不是渲染成
 * 一行「未知用户」占位——列表长度必须等于真实可打开的人数，否则数字和
 * 名单会对不上，那是最容易被识破的假。
 */
export const loadRelation = (
  userId: string,
  kind: RelationKind,
): readonly RelationEntry[] => {
  const ids =
    kind === "followers" ? listFollowers(userId) : listFollowing(userId);
  return ids
    .map((id) => loadProfile(id))
    .filter((profile): profile is ProfileView => profile !== null)
    .map((profile) => ({
      displayName: profile.displayName,
      id: profile.id,
      initials: profile.initials,
      role: profile.role,
    }));
};
