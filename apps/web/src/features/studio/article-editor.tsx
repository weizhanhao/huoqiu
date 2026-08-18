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
      <header className={styles.editorHeader}>
        <span aria-hidden="true" className={styles.editorIcon}>
          ✎
        </span>
        <div>
          <p>长文创作</p>
          <h1>写下值得沉淀的观点</h1>
          <span>清晰的标题和完整的论述，会让内容更容易被读者发现。</span>
        </div>
        <span className={styles.draftState}>
          {draftId === null ? "新文章" : "草稿已创建"}
        </span>
      </header>

      <div className={styles.composerGrid}>
        <div className={styles.paper}>
          <label className={styles.inputHeading} htmlFor="article-title">
            <span>文章标题</span>
            <small>{title.length} / 80</small>
          </label>
          <input
            aria-label="标题"
            className={styles.title}
            id="article-title"
            maxLength={80}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            placeholder="给文章起一个清晰、有信息量的标题"
            value={title}
          />

          <div className={styles.bodyHeading}>
            <label htmlFor="article-body">正文内容</label>
            <span>纯文本 · {body.length} 字</span>
          </div>
          <textarea
            aria-label="正文"
            className={styles.body}
            id="article-body"
            onChange={(event) => {
              setBody(event.target.value);
            }}
            placeholder="从你的核心观点开始，补充事实、数据和推理过程……"
            value={body}
          />
        </div>

        <aside className={styles.publishPanel}>
          <div className={styles.panelHeading}>
            <span aria-hidden="true">↗</span>
            <div>
              <h2>发布设置</h2>
              <p>保存前确认内容状态与可见范围</p>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>谁可以看到</span>
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

          <div className={styles.completion}>
            <p>发布检查</p>
            <span data-complete={title.trim().length > 0}>
              <i aria-hidden="true" />
              标题{title.trim().length > 0 ? "已填写" : "待填写"}
            </span>
            <span data-complete={body.trim().length > 0}>
              <i aria-hidden="true" />
              正文{body.trim().length > 0 ? "已填写" : "待填写"}
            </span>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={!canSubmit}
              onClick={() => void save(true)}
              type="button"
            >
              发布文章
            </button>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => void save(false)}
              type="button"
            >
              保存到草稿箱
            </button>
          </div>

          <p className={styles.publishHint}>
            发布后仍可在“我的作品”中查看，草稿会保留在当前账号下。
          </p>
        </aside>
      </div>

      {notice === null ? null : (
        <p aria-live="polite" className={styles.notice}>
          {notice}
        </p>
      )}
    </section>
  );
}
