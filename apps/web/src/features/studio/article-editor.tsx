"use client";

import { useState } from "react";

import styles from "./article-editor.module.css";
import { useAccountSession } from "../account/account-session";
import { postVisibilities, type PostVisibility } from "./visibility";

/*
 * 长文编辑。
 *
 * 存草稿和发布走同一条路：都先落成一条草稿，发布只是把它的状态改掉。
 * 分成两条路的话，「发布」会新建一条，草稿箱里留下一份孤儿，而用户
 * 以为自己只发了一次。
 */

const VISIBILITY_LABELS: Readonly<Record<PostVisibility, string>> = {
  followers: "仅粉丝可见",
  private: "仅自己可见",
  public: "公开",
};

export function ArticleEditor() {
  const { account, authorizedFetch } = useAccountSession();
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !busy;

  const save = async (publish: boolean): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      /*
       * 先存稿拿到 id，再按需发布。存稿时带上已有 id，改的是同一条——
       * 每存一次都新建的话，草稿箱会堆满同一篇文章的十几份。
       */
      const saved = await authorizedFetch("/api/social/drafts", {
        body: JSON.stringify({
          body,
          kind: "article",
          title,
          visibility,
          ...(draftId === null ? {} : { post_id: draftId }),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const savedData = (await saved.json()) as {
        error?: string;
        post?: { id: string };
      };
      if (!saved.ok || savedData.post === undefined) {
        setNotice(savedData.error ?? "存草稿失败，请稍后再试。");
        return;
      }
      setDraftId(savedData.post.id);

      if (!publish) {
        setNotice("已存入长文草稿。");
        return;
      }

      const published = await authorizedFetch("/api/social/drafts", {
        body: JSON.stringify({ post_id: savedData.post.id, publish: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const publishedData = (await published.json()) as { error?: string };
      if (!published.ok) {
        setNotice(publishedData.error ?? "发布失败，请稍后再试。");
        return;
      }
      setNotice("已发布。");
      setDraftId(null);
      setBody("");
      setTitle("");
    } catch {
      setNotice("网络不通，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  if (account === null) {
    return (
      <section className={styles.editor}>
        <p className={styles.notice}>
          <a href="/login">登录</a>后可以写长文。
        </p>
      </section>
    );
  }

  return (
    <section className={styles.editor} aria-label="发布长文">
      <input
        aria-label="标题"
        className={styles.title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        placeholder="请输入标题"
        value={title}
      />

      <textarea
        aria-label="正文"
        className={styles.body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        placeholder="请输入正文"
        value={body}
      />

      <div className={styles.settings}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>分享范围</span>
          <select
            onChange={(event) => {
              setVisibility(event.target.value as PostVisibility);
            }}
            value={visibility}
          >
            {postVisibilities.map((value) => (
              <option key={value} value={value}>
                {VISIBILITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => void save(false)}
            type="button"
          >
            存草稿
          </button>
          <button
            className={styles.primary}
            disabled={!canSubmit}
            onClick={() => void save(true)}
            type="button"
          >
            发布
          </button>
        </div>
      </div>

      {notice === null ? null : (
        <p aria-live="polite" className={styles.notice}>
          {notice}
        </p>
      )}
    </section>
  );
}
