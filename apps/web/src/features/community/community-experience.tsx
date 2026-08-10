"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { communityFeedCards, postDetail } from "./community-fixtures";
import {
  addComment,
  addReply,
  communityChannels,
  createInitialCommunityState,
  publishDraft,
  selectChannel,
  toggleFollow,
  toggleReaction,
  type PublisherMode,
} from "./community-state";
import styles from "./community-experience.module.css";

const isLocalImage = (file: File): boolean =>
  ["image/jpeg", "image/png", "image/webp"].includes(file.type);

export function CommunityFeed() {
  const [state, setState] = useState(createInitialCommunityState);
  const cards = communityFeedCards.filter(
    (card) => card.channel === state.activeChannel,
  );

  return (
    <section className={styles.section} aria-labelledby="community-heading">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>SYNTHETIC COMMUNITY / SESSION ONLY</p>
        <h2 id="community-heading">社区观察</h2>
        <p>合成演示内容：不连接真实用户或外部内容源，不构成投资建议。</p>
        <Link className={styles.backLink} href="/publish">
          发布合成草稿
        </Link>
      </header>

      <nav className={styles.channels} aria-label="社区频道">
        {communityChannels.map((channel) => (
          <button
            aria-pressed={state.activeChannel === channel}
            className={styles.channel}
            key={channel}
            onClick={() =>
              setState((current) => selectChannel(current, channel))
            }
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
        {cards.map((card) => (
          <article className={styles.card} key={card.id}>
            <span className={styles.kind}>{card.kind}</span>
            <div>
              <p className={styles.meta}>{card.author}</p>
              <h3>{card.title}</h3>
            </div>
            <p>{card.body}</p>
            <footer className={styles.cardFooter}>
              <span>{card.meta}</span>
              {card.id === "post_syn_0001" ? (
                <Link href="/community/posts/post_syn_0001">查看帖子</Link>
              ) : (
                <span>合成内容</span>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PostDetail() {
  const [state, setState] = useState(createInitialCommunityState);
  const [commentBody, setCommentBody] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = addComment(state, commentBody);
    setState(next);
    if (!next.error) setCommentBody("");
  };

  const submitReply = (
    event: FormEvent<HTMLFormElement>,
    commentId: string,
  ) => {
    event.preventDefault();
    const next = addReply(state, commentId, replyBodies[commentId] ?? "");
    setState(next);
    if (!next.error) {
      setReplyBodies((current) => ({ ...current, [commentId]: "" }));
    }
  };

  return (
    <section className={styles.section} aria-labelledby="post-title">
      <Link className={styles.backLink} href="/community">
        ← 返回社区
      </Link>
      <article className={styles.detail}>
        <header className={styles.authorRow}>
          <div className={styles.authorMeta}>
            <strong>{postDetail.author}</strong>
            <span className={styles.meta}>{postDetail.time}</span>
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

        <h2 id="post-title">{postDetail.title}</h2>
        {postDetail.body.map((paragraph) => (
          <p className={styles.detailBody} key={paragraph}>
            {paragraph}
          </p>
        ))}

        <section aria-labelledby="related-instruments-heading">
          <h3 id="related-instruments-heading">相关标的</h3>
          <ul className={styles.instrumentList}>
            {postDetail.relatedInstruments.map((instrument) => (
              <li key={instrument}>{instrument}</li>
            ))}
          </ul>
        </section>

        <aside className={styles.risk} aria-label="风险提示">
          <strong>风险提示</strong>
          <p>
            上述内容为固定合成演示，不构成投资建议，也不应作为任何决策依据。
          </p>
        </aside>

        <div className={styles.actions} aria-label="帖子互动">
          <button
            aria-pressed={state.isLiked}
            className={`${styles.action} ${state.isLiked ? styles.actionActive : ""}`}
            onClick={() =>
              setState((current) => toggleReaction(current, "like"))
            }
            type="button"
          >
            {state.likeLabel}
          </button>
          <button
            aria-pressed={state.isBookmarked}
            className={`${styles.action} ${state.isBookmarked ? styles.actionActive : ""}`}
            onClick={() =>
              setState((current) => toggleReaction(current, "bookmark"))
            }
            type="button"
          >
            {state.bookmarkLabel}
          </button>
          <span className={styles.meta}>32 评论 · 合成互动统计</span>
        </div>
      </article>

      <section className={styles.detail} aria-labelledby="comments-heading">
        <h2 id="comments-heading">评论</h2>
        <form className={styles.composer} onSubmit={submitComment}>
          <label htmlFor="new-comment">添加评论</label>
          <textarea
            id="new-comment"
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="写下你的合成会话评论"
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
          {state.comments.map((comment) => (
            <li className={styles.comment} key={comment.id}>
              <div>
                <h3>{comment.author}</h3>
                <time className={styles.commentTime}>{comment.time}</time>
              </div>
              <p>{comment.body}</p>
              {comment.replies.length > 0 ? (
                <ol
                  className={styles.replyList}
                  aria-label={`${comment.author} 的回复`}
                >
                  {comment.replies.map((reply) => (
                    <li className={styles.reply} key={reply.id}>
                      <strong>{reply.author}</strong>
                      <p>{reply.body}</p>
                      <time className={styles.commentTime}>{reply.time}</time>
                    </li>
                  ))}
                </ol>
              ) : null}
              <form
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
    </section>
  );
}

type PreviewImage = Readonly<{ name: string; url: string }>;

export function Publisher() {
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

    setPreview({ name: file.name, url: URL.createObjectURL(file) });
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = publishDraft({ body, mode, title });
    setError(result.error);
    setNotice(null);
    setSuccess(result.success);
  };

  const announceUnavailable = (feature: string) => {
    setError(null);
    setNotice(`${feature}选择器暂未开放。`);
    setSuccess(null);
  };

  return (
    <section className={styles.section} aria-labelledby="publish-heading">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>SYNTHETIC PUBLISHER / SESSION ONLY</p>
        <h2 id="publish-heading">发布合成草稿</h2>
        <p>草稿只会存在于本次会话；不会上传、保存或发布到真实社区。</p>
      </header>

      <form className={styles.publisher} onSubmit={submit}>
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
              placeholder="给这篇合成长文起一个标题"
              type="text"
              value={title}
            />
          </label>
        ) : null}
        <label>
          {mode === "article" ? "长文正文" : "讨论正文"}
          <textarea
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              mode === "article" ? "写下合成长文正文" : "写下合成讨论"
            }
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
          <button
            className={styles.toolButton}
            onClick={() => announceUnavailable("话题")}
            type="button"
          >
            话题（暂未开放）
          </button>
          <button
            className={styles.toolButton}
            onClick={() => announceUnavailable("@ 用户")}
            type="button"
          >
            @ 用户（暂未开放）
          </button>
          <button
            className={styles.toolButton}
            onClick={() => announceUnavailable("关联标的")}
            type="button"
          >
            关联标的（暂未开放）
          </button>
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
            <span>这是本地合成会话状态，未持久化。</span>
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
