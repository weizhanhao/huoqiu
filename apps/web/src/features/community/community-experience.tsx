"use client";

import Link from "next/link";
import { InstrumentLink } from "../../components/instrument/instrument-link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import {
  communityAuthors,
  getCommunityAuthor,
} from "./community-author-fixtures";
import { PostBody } from "./post-body";
import { useAccountSession } from "../account/account-session";
import { useOptionalProfileSession } from "../profile-settings/profile-session";
import { applyWatermark } from "../../lib/watermark";
import { useBlockedAuthors } from "./blocked-authors";
import {
  createSyntheticCommunityCard,
  formatCommunityCount,
  type FeedCard,
} from "./community-content-model";
import { BookmarkButton } from "./bookmark-button";
import { CommunityFeedCard } from "./community-feed-card";
import { LikeButton } from "./like-button";
import { RealComments } from "./real-comments";
import {
  communityFeedCards,
  getCommunityFeedCards,
  getPostDetailView,
  postDetail,
  type PostDetailView,
} from "./community-fixtures";

/*
 * 单帖路由与测试夹具不传 post 时的回落对象。
 * 首帖一定存在，取不到就说明 fixture 被改坏了，此时宁可用旧的 postDetail
 * 常量兜底，也不要让整页崩掉。
 */
/*
 * 每页条数。
 *
 * 取 8 是因为 1440×900 的屏幕上首屏大约能放下 3–4 张卡，8 条正好让用户
 * 滚一屏多一点就遇到「加载更多」，既不会一屏就到底，也不会滚很久才看到出口。
 */
const PAGE_SIZE = 8;

const FIRST_POST_DETAIL: PostDetailView = getPostDetailView(
  "post_syn_0001",
) ?? {
  author: postDetail.author,
  authorId: postDetail.authorId,
  baselineCommentTotal: postDetail.baselineCommentTotal,
  body: postDetail.body,
  engagement: { bookmarks: 0, reposts: 0, views: 0 },
  id: "post_syn_0001",
  relatedInstruments: postDetail.relatedInstruments,
  tags: [],
  time: postDetail.time,
  title: postDetail.title,
};
import {
  addComment,
  addReply,
  communityChannels,
  createInitialCommunityState,
  publishDraft,
  selectChannel,
  sortComments,
  toggleCommentLike,
  toggleFollow,
  type CommentSort,
  type CommunityChannel,
  type PublisherMode,
} from "./community-state";
import { classifySymbol } from "../../lib/symbol-category";
import { useSessionPosts } from "./session-posts";
import styles from "./community-experience.module.css";

const isLocalImage = (file: File): boolean =>
  ["image/jpeg", "image/png", "image/webp"].includes(file.type);

function CommunityAuthorSpotlight() {
  return (
    <section
      className={styles.authorSpotlight}
      aria-labelledby="synthetic-authors-heading"
    >
      <header className={styles.spotlightHeading}>
        <div>
          <p className={styles.eyebrow}>栏目作者</p>
          <h3 id="synthetic-authors-heading">达人观察席</h3>
        </div>
      </header>
      <div className={styles.authorGrid}>
        {communityAuthors.slice(0, 4).map((author) => (
          <article className={styles.authorCard} key={author.id}>
            <div className={styles.authorIdentity}>
              <span className={styles.avatar} aria-hidden="true">
                {author.initials}
              </span>
              <div>
                <strong>{author.displayName}</strong>
                <span>{author.role}</span>
              </div>
            </div>
            <p>{author.bio}</p>
            <div className={styles.authorStats}>
              <span>{formatCommunityCount(author.followers)} 位读者</span>
              <span>{author.notes} 篇笔记</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type CommunityFeedProperties = Readonly<{
  /** 深链进来的初始频道；缺省时用社区自己的默认频道。 */
  initialChannel?: CommunityChannel | undefined;
}>;

export function CommunityFeed({
  initialChannel,
}: CommunityFeedProperties = {}) {
  const { posts: sessionPosts } = useSessionPosts();
  const { posts: storedPosts } = useAccountSession();
  const { blocked } = useBlockedAuthors();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [state, setState] = useState(() =>
    initialChannel === undefined
      ? createInitialCommunityState()
      : createInitialCommunityState(initialChannel),
  );

  /*
   * 三个来源按「离用户有多近」排序：
   *   1. 注册账号发布并落盘的真实帖子——刷新还在，永久链接可分享；
   *   2. 未登录时的本次会话草稿——刷新即失，卡片上会写明；
   *   3. 编辑部录入的栏目记录。
   * 刚发的东西必须一眼看见，所以真实帖子和会话草稿都排在栏目前面。
   */
  const visible =
    state.activeChannel === "关注"
      ? [
          ...storedPosts.map((post) => storedPostToCard(post)),
          ...sessionPosts,
          ...getCommunityFeedCards(state.activeChannel),
        ]
      : getCommunityFeedCards(state.activeChannel);

  // 被屏蔽作者的内容直接不出现在流里——屏蔽按钮承诺的就是这个。
  const cards = visible.filter((card) => !blocked.includes(card.authorId));

  return (
    <section
      className={styles.section}
      aria-labelledby="community-heading"
      data-testid="community-feed"
    >
      <header className={styles.intro}>
        <p className={styles.eyebrow}>社区</p>
        <h2 id="community-heading">社区观察</h2>
        <p>
          栏目记录由编辑部维护，用户内容来自本机注册账号。
        </p>
        <Link className={styles.backLink} href="/publish">
          写帖子
        </Link>
      </header>

      <nav className={styles.channels} aria-label="社区频道">
        {communityChannels.map((channel) => (
          <button
            aria-pressed={state.activeChannel === channel}
            className={styles.channel}
            key={channel}
            onClick={() => {
              setState((current) => selectChannel(current, channel));
              // 切频道要回到第一页：否则从第 3 页切到内容更少的频道会看到空列表。
              setShown(PAGE_SIZE);
            }}
            type="button"
          >
            {channel}
          </button>
        ))}
      </nav>
      <p className={styles.notice} aria-live="polite">
        {state.feedAnnouncement}
      </p>

      <div className={styles.feed}>
        {cards.slice(0, shown).map((card) => (
          <CommunityFeedCard card={card} key={card.id} />
        ))}
      </div>

      {/*
        到底了就说到底了。
        之前列表一次吐完所有内容，既没有「加载更多」也没有结束提示，
        用户分不清是刷完了还是页面坏了。
      */}
      <p className={styles.feedFooter} aria-live="polite">
        {shown >= cards.length ? (
          `已显示全部 ${cards.length} 条`
        ) : (
          <>
            <button
              className={styles.action}
              onClick={() => setShown((current) => current + PAGE_SIZE)}
              type="button"
            >
              加载更多
            </button>
            <span>
              已显示 {shown} / {cards.length} 条
            </span>
          </>
        )}
      </p>

      <CommunityAuthorSpotlight />
    </section>
  );
}

/*
 * 帖子详情。
 *
 * post 缺省时回落到首帖，是为了让既有的单帖路由与浏览器测试夹具无需改动；
 * 新的动态路由会把真实的帖子传进来。
 */
export function PostDetail({
  post,
  realPostId,
}: Readonly<{ post?: PostDetailView; realPostId?: string }> = {}) {
  const detail = post ?? FIRST_POST_DETAIL;
  const [state, setState] = useState(createInitialCommunityState);
  const [commentBody, setCommentBody] = useState("");
  const [commentSort, setCommentSort] = useState<CommentSort>("newest");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const author = getCommunityAuthor(detail.authorId);
  /*
   * 发评论的是谁，就署谁的名。
   *
   * 这里过去把所有会话内评论都署成「火球演示用户」，真实账号写下的评论
   * 挂着别人的名字。未登录时传 null，由状态层拒绝并提示登录。
   */
  const { account: viewer } = useAccountSession();
  const viewerName = viewer?.displayName ?? null;
  const fixedCommentCount = state.comments.filter(
    ({ origin }) => origin === "fixed-synthetic",
  ).length;
  const sessionCommentCount = state.comments.length - fixedCommentCount;
  const replies = state.comments.flatMap((comment) => comment.replies);
  const fixedReplyCount = replies.filter(
    ({ origin }) => origin === "fixed-synthetic",
  ).length;
  const sessionReplyCount = replies.length - fixedReplyCount;
  const commentCountSummary = `展示 ${state.comments.length} 条评论 / 页面基线共 ${detail.baselineCommentTotal} 条${
    sessionCommentCount > 0
      ? `（含本次会话新增 ${sessionCommentCount} 条）`
      : ""
  }`;

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = addComment(state, commentBody, viewerName);
    setState(next);
    if (!next.error) setCommentBody("");
  };

  const submitReply = (
    event: FormEvent<HTMLFormElement>,
    commentId: string,
  ) => {
    event.preventDefault();
    const next = addReply(
      state,
      commentId,
      replyBodies[commentId] ?? "",
      viewerName,
    );
    setState(next);
    if (!next.error) {
      setReplyBodies((current) => ({ ...current, [commentId]: "" }));
    }
  };

  return (
    <section
      className={styles.section}
      aria-labelledby="post-title"
      data-testid="community-post-detail"
    >
      <Link className={styles.backLink} href="/community">
        ← 返回社区
      </Link>
      <article className={styles.detail}>
        <header className={styles.authorRow}>
          <div className={styles.detailAuthor}>
            <span className={styles.avatar} aria-hidden="true">
              {author?.initials ?? "北"}
            </span>
            <div className={styles.authorMeta}>
              <strong>
                <Link href={`/users/${detail.authorId}`}>{detail.author}</Link>
              </strong>
              <span className={styles.meta}>{detail.time}</span>
              <span className={styles.authorBio}>{author?.bio}</span>
              <span className={styles.meta}>
                {formatCommunityCount(author?.followers ?? 0)} 位读者 ·{" "}
                {author?.notes ?? 0} 篇记录
              </span>
            </div>
          </div>
          <button
            aria-pressed={state.isFollowing}
            className={`${styles.action} ${state.isFollowing ? styles.actionActive : ""}`}
            onClick={() => setState((current) => toggleFollow(current))}
            type="button"
          >
            {state.followLabel}
          </button>
        </header>

        <h2 id="post-title">{detail.title}</h2>
        {/*
          声明摆在正文之前。摆在末尾的话，读者读完才知道这篇包含 AI 生成
          内容——那时该起的作用已经过去了。
        */}
        {detail.disclosure === "ai" ? (
          <p className={styles.disclosure}>
            <span aria-hidden="true">!</span> 本文包含AI生成内容
          </p>
        ) : null}
        <PostBody
          accounts={detail.bodyContext?.accounts ?? []}
          paragraphs={detail.body}
          topics={detail.bodyContext?.topics ?? []}
        />

        {detail.tags.length === 0 ? null : (
          <div className={styles.tagList} aria-label="内容标签">
            {detail.tags.map((tag) => (
              <Link href={`/topics/${encodeURIComponent(tag)}`} key={tag}>
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {detail.relatedInstruments.length === 0 ? null : (
          <section aria-labelledby="related-instruments-heading">
            <h3 id="related-instruments-heading">相关标的</h3>
            {/*
              每条都是真实标的，点得进站内的标的页。
              原先这里是三只编出来的证券，纯文本、不可点，其中「星海智造」
              还是早前从全站删掉的那批虚构标的——一个财经站的「相关标的」栏
              列着查不到的东西，比不列更糟。
            */}
            <ul className={styles.instrumentList}>
              {detail.relatedInstruments.map((instrument) => (
                <li key={instrument.symbol}>
                  <InstrumentLink symbol={instrument.symbol}>
                    {instrument.name}
                    <small>{instrument.symbol.slice(2)}</small>
                  </InstrumentLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <aside className={styles.risk} aria-label="风险提示">
          <strong>风险提示</strong>
          <p>
            本文讨论的是记录与复盘方法，不构成投资建议，也不应作为任何决策依据。
          </p>
        </aside>

        <div className={styles.actions} aria-label="帖子互动">
          {/*
            点赞与收藏用信息流卡片里那两个真的按钮。
            这里此前只调本地 toggleReaction——全程没有网络请求，赞数写死成
            128（community-state.ts 里的常量），刷新就还原。也就是说一条刚
            发出来、真实赞数为 0 的帖子，详情页照样显示 128 赞，点一下变
            129，再刷新又回到 128。
          */}
          <LikeButton
            /*
             * 样本帖的赞数回落取自它在信息流里的那一份，
             * 免得同一篇帖子在列表和详情页显示两个不同的数。
             */
            fallbackCount={
              communityFeedCards.find((card) => card.id === detail.id)
                ?.engagement.likes ?? 0
            }
            postId={realPostId ?? detail.id}
          />
          <BookmarkButton postId={realPostId ?? detail.id} />
          <span className={styles.meta} data-testid="comment-count-summary">
            {commentCountSummary}
          </span>
          {/* 这一行过去对 30 篇帖子显示同一组写死的数字。 */}
          <span className={styles.meta}>
            {formatCommunityCount(detail.engagement.reposts)} 次转发 ·{" "}
            {formatCommunityCount(detail.engagement.views)} 次浏览
          </span>
        </div>
      </article>

      {/*
        真实帖子读写落盘的评论。
        样本帖仍用下面这套固定评论——它们本来就是编辑部随产品录入的内容；
        但真帖此前也共用同一份，于是一条刚发出来的记录底下挂着 7 条与它
        毫无关系的讨论。
      */}
      {realPostId === undefined ? (
        <section className={styles.detail} aria-labelledby="comments-heading">
          <div className={styles.commentsHeading}>
            <h2 id="comments-heading">评论</h2>
            <div
              className={styles.commentSort}
              role="group"
              aria-label="评论排序"
            >
              {(
                [
                  ["newest", "最新"],
                  ["likes", "最热"],
                ] as const
              ).map(([id, label]) => (
                <button
                  aria-pressed={commentSort === id}
                  key={id}
                  onClick={() => setCommentSort(id)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={styles.meta}>
              栏目 {fixedCommentCount} 条 · 本次会话 {sessionCommentCount} 条 ·
              回复：固定 {fixedReplyCount} / 会话 {sessionReplyCount} ·
              会话新增内容刷新后重置
            </span>
          </div>
          <form
            method="post"
            className={styles.composer}
            onSubmit={submitComment}
          >
            <label htmlFor="new-comment">添加评论</label>
            <textarea
              id="new-comment"
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="写下你的评论"
              value={commentBody}
            />
            <div className={styles.composerActions}>
              <button className={styles.submit} type="submit">
                发布评论
              </button>
              <span className={styles.disclosure}>
                仅添加到本次会话，不会保存。
              </span>
            </div>
          </form>

          {state.error ? (
            <p className={styles.error} role="alert">
              {state.error}
            </p>
          ) : null}
          {state.status ? (
            <p className={styles.notice} aria-live="polite">
              {state.status}
            </p>
          ) : null}

          <ol className={styles.commentList}>
            {sortComments(state.comments, commentSort).map((comment) => (
              <li
                className={styles.comment}
                data-content-origin={comment.origin}
                data-testid={`${comment.origin}-comment`}
                key={comment.id}
              >
                <div>
                  <h3>{comment.author}</h3>
                  <time className={styles.commentTime}>{comment.time}</time>
                  <span className={styles.originBadge}>
                    {comment.origin === "fixed-synthetic" ? "栏目" : "本次会话"}
                  </span>
                </div>
                <p>{comment.body}</p>
                {/* 这里原本是静态文本，和当初点不动的转发数是同一类问题。 */}
                <button
                  aria-pressed={comment.liked === true}
                  className={styles.commentLikeButton}
                  onClick={() =>
                    setState((current) =>
                      toggleCommentLike(current, comment.id),
                    )
                  }
                  type="button"
                >
                  {comment.liked === true ? "已赞" : "赞"} {comment.likes}
                </button>
                {comment.replies.length > 0 ? (
                  <ol
                    className={styles.replyList}
                    aria-label={`${comment.author} 的回复`}
                  >
                    {comment.replies.map((reply) => (
                      <li
                        className={styles.reply}
                        data-content-origin={reply.origin}
                        data-testid={`${reply.origin}-reply`}
                        key={reply.id}
                      >
                        <strong>{reply.author}</strong>
                        <span className={styles.originBadge}>
                          {reply.origin === "fixed-synthetic"
                            ? "栏目"
                            : "本次会话"}
                        </span>
                        <p>{reply.body}</p>
                        <time className={styles.commentTime}>{reply.time}</time>
                        <span className={styles.commentLikes}>
                          {reply.likes} 个赞
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <form
                  method="post"
                  className={styles.replyComposer}
                  onSubmit={(event) => submitReply(event, comment.id)}
                >
                  <label htmlFor={`reply-${comment.id}`}>
                    回复 {comment.author}
                  </label>
                  <input
                    id={`reply-${comment.id}`}
                    onChange={(event) =>
                      setReplyBodies((current) => ({
                        ...current,
                        [comment.id]: event.target.value,
                      }))
                    }
                    placeholder="写下回复"
                    value={replyBodies[comment.id] ?? ""}
                  />
                  <button className={styles.action} type="submit">
                    回复
                  </button>
                </form>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <RealComments postId={realPostId} />
      )}
    </section>
  );
}

/*
 * 把落盘的真实帖子转成信息流卡片。
 *
 * 互动计数一律给 0：这些帖子刚发出来，还没有人转发点赞。
 * 与其借用栏目内容那种四位数的漂亮数字，不如老实显示 0——
 * 一个新账号的第一条帖子写着「4,820 次浏览」，才是真正的破绽。
 */
const storedPostToCard = (
  post: Readonly<{
    authorId: string;
    authorName: string;
    body: string;
    createdAt: string;
    id: string;
    title: string;
  }>,
): FeedCard =>
  createSyntheticCommunityCard({
    author: post.authorName,
    authorId: post.authorId,
    body: post.body,
    channel: "关注",
    detailHref: `/community/posts/${post.id}`,
    engagement: { comments: 0, likes: 0, reposts: 0, views: 0 },
    id: post.id,
    kind: "帖子",
    meta: "已保存",
    publishedLabel: formatStoredTime(post.createdAt),
    tags: [],
    title: post.title,
  });

const formatStoredTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(parsed);
};

type PreviewImage = Readonly<{ name: string; url: string }>;

/** 话题候选取自固定社区内容已有的标签，避免另造一份会漂移的清单。 */
const publisherTopics: readonly string[] = [
  ...new Set(getCommunityFeedCards("热门").flatMap((card) => card.tags)),
]
  .map((tag) => tag.replace(/^#/u, ""))
  .slice(0, 8);

export function Publisher() {
  const { publish } = useSessionPosts();
  const { account, publish: publishToAccount } = useAccountSession();
  /*
   * 读不到偏好就按「不加水印」走，而不是让发帖框崩掉——
   * 发帖是核心功能，不该被一个可选的显示偏好拖垮。
   */
  const watermarkImages =
    useOptionalProfileSession()?.preferences.watermarkImages ?? false;
  /* 水印盖的是当前账号的昵称；未登录时没有可署的名字，就不盖。 */
  const displayName = account?.displayName ?? "";
  const [mode, setMode] = useState<PublisherMode>("discussion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const changeMode = (nextMode: PublisherMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setSuccess(null);
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isLocalImage(file)) {
      setError("仅支持本地 JPEG、PNG 或 WebP 图片；文件不会上传网络。");
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview({ name: file.name, url });
    setError(null);

    /*
     * 偏好里开了水印就真的盖上去。
     *
     * 整个过程在浏览器里完成：读这张本地图片、画到 canvas 上、右下角写上
     * 昵称，导出成新的预览图。图片依旧没有离开这台机器。
     *
     * 盖不上时沿用原图——水印失败不该让整张图消失。
     */
    if (!watermarkImages) return;
    const stamp = displayName.trim();
    if (stamp.length === 0) return;
    void applyWatermark(url, stamp).then((stamped) => {
      if (stamped === null) return;
      setPreview({ name: file.name, url: stamped });
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = publishDraft({ body, mode, title });
    setError(result.error);
    setNotice(null);
    // 校验通过才真正写入，否则「发布成功」就是一句空话。
    if (result.success === null) {
      setSuccess(null);
      return;
    }

    /*
     * 已登录就写服务端，刷新、换页、重启都还在，并且这条帖子会出现在
     * 作者主页、帖子数统计和它自己的永久链接上。
     * 未登录仍允许发，但只进本次会话，并在提示里说清区别——
     * 不说清楚就等于骗人说「已保存」。
     */
    if (account === null) {
      publish({ body, mode, title });
      setBody("");
      setTitle("");
      setSuccess(`${result.success}（未登录，仅本次会话可见）`);
      return;
    }

    const failure = await publishToAccount(
      mode === "article" ? title.trim() : body.trim().slice(0, 24),
      body.trim(),
    );
    if (failure !== null) {
      setSuccess(null);
      setError(failure);
      return;
    }
    setBody("");
    setTitle("");
    setSuccess(`${result.success}（已保存到 ${account.displayName} 的主页）`);
  };

  /**
   * 把选中的话题 / 用户 / 标的插入正文末尾。
   *
   * 雪球这三个入口的实质就是往正文里插一个可识别的记号，
   * 所以不需要后端也能做成真的——之前它们是「暂未开放」，
   * 而 yaoqiu.md 要求每个按钮要么真实可用，要么明确未开放。
   */
  const insertToken = (token: string) => {
    setBody((current) =>
      current.length === 0 || current.endsWith(" ")
        ? `${current}${token} `
        : `${current} ${token} `,
    );
    setError(null);
    setNotice(null);
    setSuccess(null);
  };

  return (
    <section className={styles.section} aria-labelledby="publish-heading">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>发布</p>
        <h2 id="publish-heading">写一条记录</h2>
        <p>草稿只会存在于本次会话；不会上传、保存或发布到真实社区。</p>
      </header>

      <form method="post" className={styles.publisher} onSubmit={submit}>
        <div className={styles.modeTabs} aria-label="发布模式">
          <button
            aria-pressed={mode === "discussion"}
            className={styles.modeTab}
            onClick={() => changeMode("discussion")}
            type="button"
          >
            发讨论
          </button>
          <button
            aria-pressed={mode === "article"}
            className={styles.modeTab}
            onClick={() => changeMode("article")}
            type="button"
          >
            写长文
          </button>
        </div>

        {mode === "article" ? (
          <label>
            长文标题
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="给这篇长文起一个标题"
              type="text"
              value={title}
            />
          </label>
        ) : null}
        <label>
          {mode === "article" ? "长文正文" : "讨论正文"}
          <textarea
            onChange={(event) => setBody(event.target.value)}
            placeholder={mode === "article" ? "写下长文正文" : "写下你的讨论"}
            value={body}
          />
        </label>

        <div>
          <label htmlFor="local-image">选择本地图片</label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className={styles.fileInput}
            id="local-image"
            onChange={chooseImage}
            type="file"
          />
          <p className={styles.disclosure}>
            仅限 JPEG、PNG、WebP；仅本地预览，不上传网络。
          </p>
        </div>
        {preview ? (
          <div className={styles.mediaPreview}>
            <img alt={`本地预览：${preview.name}`} src={preview.url} />
            <span className={styles.previewMeta}>{preview.name}</span>
            <button
              className={styles.remove}
              onClick={() => setPreview(null)}
              type="button"
            >
              移除图片
            </button>
          </div>
        ) : null}

        <div className={styles.toolRow} aria-label="发布辅助工具">
          <label className={styles.toolPicker}>
            <span>话题</span>
            <select
              onChange={(event) => {
                if (event.target.value !== "") {
                  insertToken(`#${event.target.value}#`);
                  event.target.value = "";
                }
              }}
              value=""
            >
              <option value="">插入话题</option>
              {publisherTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.toolPicker}>
            <span>@ 用户</span>
            <select
              onChange={(event) => {
                if (event.target.value !== "") {
                  insertToken(`@${event.target.value}`);
                  event.target.value = "";
                }
              }}
              value=""
            >
              <option value="">插入用户</option>
              {communityAuthors.map((author) => (
                <option key={author.id} value={author.displayName}>
                  {author.displayName}
                </option>
              ))}
            </select>
          </label>

          {/*
            关联标的。
            这里此前是一个下拉框，列着 35 个虚构公司——选哪个都会给帖子打上
            一个不存在的标的标记，而那条帖子在任何一个真实标的页上都不会出现。
            现在直接填真实代码，填错了当场说清楚，而不是让它默默发出去。
          */}
          <label className={styles.toolPicker}>
            <span>关联标的</span>
            <input
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const field = event.currentTarget;
                const raw = field.value.trim().toLowerCase();
                if (raw.length === 0) return;
                if (classifySymbol(raw) === "other") {
                  setError(
                    `${raw} 不是站内能定价的代码。请填沪深代码，例如 sh600519。`,
                  );
                  return;
                }
                insertToken(`$${raw}$`);
                field.value = "";
                setError(null);
              }}
              placeholder="填代码后回车，如 sh600519"
              type="text"
            />
          </label>
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        {success ? (
          <div className={styles.success} role="status">
            <strong>{success}</strong>
            {/* 登录后确实会落盘，这里不能再一律说「未持久化」。 */}
            <span>
              {account === null
                ? "未登录发布只保留在本次会话，刷新后消失。"
                : "已写入本机存储，刷新和重启后仍在。"}
            </span>
            <Link href="/community">返回社区</Link>
          </div>
        ) : null}

        <button className={styles.submit} type="submit">
          发布到本次会话
        </button>
      </form>
    </section>
  );
}
