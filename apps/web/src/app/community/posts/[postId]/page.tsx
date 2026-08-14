import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesktopShell } from "../../../../components/shell/desktop-shell";
import { PostDetail } from "../../../../features/community/community-experience";
import {
  getPostDetailView,
  type PostDetailView,
} from "../../../../features/community/community-fixtures";
import { communityFeedCards } from "../../../../features/community/community-fixtures";
import {
  countPostView,
  getPost,
  listAccounts,
  readPostViews,
} from "../../../../server/social-store";

/*
 * 正文里 @ 与 # 的解析依据。
 *
 * 在服务端算好传下去：能被链到的人和话题必须由服务端说了算，而且账号表
 * 与话题表本来就在这一侧。
 */
const bodyContext = () => ({
  accounts: listAccounts().map((account) => ({
    displayName: account.displayName,
    id: account.id,
  })),
  topics: [...new Set(communityFeedCards.flatMap((card) => card.tags))],
});

/*
 * 帖子永久链接。
 *
 * 两类帖子共用这一条路由：编辑部随产品录入的栏目记录（编译期常量），
 * 以及注册账号发布并落盘的真实帖子。后者是运行时才存在的，所以整条路由
 * 每次请求重新求值。
 */
export const dynamic = "force-dynamic";

type PageProperties = Readonly<{
  params: Promise<{ postId: string }>;
}>;

const formatDate = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const resolvePost = (postId: string): PostDetailView | null => {
  const column = getPostDetailView(postId);
  if (column !== null) {
    return column;
  }

  const stored = getPost(postId);
  if (stored === null) {
    return null;
  }

  /*
   * 转发要能看到被转发的是什么。
   *
   * 只显示一句「转发」而不带原帖，读者根本不知道在转什么。原帖查不到时
   * 如实说明它已不存在，而不是假装这是一条普通帖子。
   */
  const quoted =
    stored.quotedPostId === undefined ? null : getPost(stored.quotedPostId);
  const quotedLines =
    stored.quotedPostId === undefined
      ? []
      : [
          quoted === null
            ? "转发的原帖已不存在。"
            : `转发自 ${quoted.authorName}《${quoted.title}》：${quoted.body}`,
        ];

  return {
    author: stored.authorName,
    authorId: stored.authorId,
    baselineCommentTotal: 0,
    bodyContext: bodyContext(),
    ...(stored.disclosure === undefined
      ? {}
      : { disclosure: stored.disclosure }),
    // 用户发布的正文按空行分段；只有一段也照常渲染，不补内容。
    body: [
      ...stored.body
        .split(/\n{2,}/u)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0),
      ...quotedLines,
    ],
    /*
     * 阅读量是真数：每打开一次这一页记一笔，这里读的是累计值。
     * 转发与收藏还没有对应的存储，如实显示 0，不拿阅读量凑数。
     */
    engagement: { bookmarks: 0, reposts: 0, views: readPostViews(stored.id) },
    id: stored.id,
    relatedInstruments: [],
    tags: [],
    time: `${formatDate(stored.createdAt)} · 用户发布`,
    title: stored.title,
  };
};

export async function generateMetadata({
  params,
}: PageProperties): Promise<Metadata> {
  const { postId } = await params;
  const post = resolvePost(postId);
  if (post === null) {
    return { title: "帖子不存在 · 火球" };
  }
  return {
    description: post.body[0] ?? post.title,
    title: `${post.title} · 火球`,
  };
}

export default async function CommunityPostPage({ params }: PageProperties) {
  const { postId } = await params;

  /*
   * 先记一笔再取详情，读者看到的数里包含自己这一次。
   * 反过来的话，一篇刚被打开的帖子显示的是「0 次阅读」。
   *
   * 栏目帖不在存储里，countPostView 自己会挡掉，这里不必再判一次。
   * generateMetadata 不记：它和本函数同属一次请求，两处都记会翻倍。
   */
  countPostView({ now: new Date().toISOString(), postId });

  const post = resolvePost(postId);
  if (post === null) {
    notFound();
  }

  /*
   * 只有落盘的用户帖走真实评论。
   *
   * 栏目帖（post_syn_* 等）不在存储里，它们底下那套固定评论是随产品录入的
   * 内容，保持原样；此前真帖也共用同一份，于是一条刚发出来的记录底下挂着
   * 7 条与它毫无关系的讨论。
   */
  const isStoredPost = /^post_[0-9a-f]{16}$/u.test(postId);

  return (
    <DesktopShell>
      <PostDetail
        post={post}
        {...(isStoredPost ? { realPostId: postId } : {})}
      />
    </DesktopShell>
  );
}
