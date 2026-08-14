"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./community-experience.module.css";

/*
 * 真实帖子的评论区。
 *
 * 此前所有帖子——包括注册账号刚发出来的那条——共用同一份样本评论：一条真帖
 * 底下挂着 7 条与它毫无关系的讨论。而用户自己发的评论只活在客户端 reducer
 * 里，id 形如 comment_session_1，刷新就没了。
 *
 * 这里读写的是落盘的评论：别人看得到，刷新还在，并且会成为被评论者的一条
 * 真实通知。
 */

type RealComment = Readonly<{
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  id: string;
  parentId?: string;
}>;

const formatTime = (iso: string): string =>
  `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;

/** 只取数、不碰状态：effect 与提交后的刷新共用同一段逻辑。 */
const fetchComments = async (
  postId: string,
): Promise<readonly RealComment[]> => {
  try {
    const response = await fetch(
      `/api/social/comments?post=${encodeURIComponent(postId)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      comments?: readonly RealComment[];
    };
    return data.comments ?? [];
  } catch {
    // 拉不到就保持空列表，不编一条「加载失败」混进真实评论里。
    return [];
  }
};

export function RealComments({ postId }: Readonly<{ postId: string }>) {
  const { account, authorizedFetch } = useAccountSession();
  const [comments, setComments] = useState<readonly RealComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  /*
   * 取数与改状态分开。
   *
   * 取数做成不碰状态的纯函数，状态更新留在各自的调用点——effect 里的写入
   * 因此一定发生在 await 之后，不会在同一轮渲染里再触发一次。
   *
   * 顺带补上取消：原先没有，快速切换帖子时先发的请求后到，会把上一篇的
   * 评论盖到这一篇上，而两边都是真数据，看不出错。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchComments(postId);
      if (cancelled) return;
      setComments(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const submit = async (text: string, parentId?: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await authorizedFetch("/api/social/comments", {
        body: JSON.stringify({
          body: text,
          post: postId,
          ...(parentId === undefined ? {} : { parent: parentId }),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "发布失败。");
        return;
      }
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      setComments(await fetchComments(postId));
    } finally {
      setPending(false);
    }
  };

  const topLevel = comments.filter(({ parentId }) => parentId === undefined);
  const repliesOf = (id: string): readonly RealComment[] =>
    comments.filter(({ parentId }) => parentId === id);

  return (
    <section className={styles.detail} aria-labelledby="real-comments-heading">
      <h2 id="real-comments-heading">
        评论
        <span className={styles.meta}>
          {loading ? " 读取中…" : ` 共 ${comments.length} 条`}
        </span>
      </h2>

      {account === null ? (
        <Link className={styles.action} href="/login">
          登录后参与讨论
        </Link>
      ) : (
        <form
          method="post"
          className={styles.commentForm}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void submit(body);
          }}
        >
          <label htmlFor="real-comment">添加评论</label>
          <textarea
            id="real-comment"
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="说说你的看法"
            value={body}
          />
          <button className={styles.submit} disabled={pending} type="submit">
            {pending ? "发布中" : "发布评论"}
          </button>
        </form>
      )}

      {error === "" ? null : (
        <p aria-live="polite" className={styles.meta}>
          {error}
        </p>
      )}

      {/* 空态要说清楚是「还没有人评论」，而不是留一片空白让人以为没加载出来。 */}
      {!loading && comments.length === 0 ? (
        <p className={styles.meta}>还没有人评论，来写第一条。</p>
      ) : null}

      <ol>
        {topLevel.map((comment) => (
          <li className={styles.comment} key={comment.id}>
            <p>
              <Link href={`/users/${comment.authorId}`}>
                {comment.authorName}
              </Link>
              <span className={styles.meta}>
                {" "}
                {formatTime(comment.createdAt)}
              </span>
            </p>
            <p>{comment.body}</p>

            {account === null ? null : (
              <button
                className={styles.action}
                onClick={() =>
                  setReplyTo((current) =>
                    current === comment.id ? null : comment.id,
                  )
                }
                type="button"
              >
                回复
              </button>
            )}

            {replyTo === comment.id ? (
              <form
                method="post"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void submit(replyBody, comment.id);
                }}
              >
                <label htmlFor={`real-reply-${comment.id}`}>
                  回复 {comment.authorName}
                </label>
                <textarea
                  id={`real-reply-${comment.id}`}
                  maxLength={2000}
                  onChange={(event) => setReplyBody(event.target.value)}
                  value={replyBody}
                />
                <button
                  className={styles.submit}
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "发布中" : "回复"}
                </button>
              </form>
            ) : null}

            <ol>
              {repliesOf(comment.id).map((reply) => (
                <li className={styles.reply} key={reply.id}>
                  <p>
                    <Link href={`/users/${reply.authorId}`}>
                      {reply.authorName}
                    </Link>
                    <span className={styles.meta}>
                      {" "}
                      {formatTime(reply.createdAt)}
                    </span>
                  </p>
                  <p>{reply.body}</p>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
