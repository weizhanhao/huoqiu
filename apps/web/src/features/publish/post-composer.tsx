"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { insertAtCursor } from "./composer-tokens";
import { ComposerToolbar, type Disclosure } from "./composer-toolbar";
import styles from "./post-composer.module.css";
import { useAccountSession } from "../account/account-session";

/*
 * 发帖框。
 *
 * 一个组件两处用：首页顶部内嵌一份，顶栏「发帖」弹出一份。两处各写一遍的话，
 * 校验、错误文案、存草稿的行为迟早各走各的。
 *
 * 「长文」不在这里写——长文要标题、封面、分享范围，塞进这个小框里两头
 * 都不好用。点它跳到创作者中心的长文页，和雪球一样。
 */
export function PostComposer({
  onPublished,
  variant,
}: Readonly<{
  onPublished?: () => void;
  variant: "inline" | "modal";
}>) {
  const { account, authorizedFetch, refresh } = useAccountSession();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [disclosure, setDisclosure] = useState<Disclosure>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /*
   * 工具栏插进来的东西落在光标处，插完把光标放到它后面并把焦点还回输入框。
   *
   * 一律追加到末尾的话，光标停在句中时插出来的东西会跑到最后；不还焦点的话，
   * 选完一个表情就得再点一次输入框才能接着打字。
   */
  const insert = (text: string): void => {
    const input = inputRef.current;
    const at = input?.selectionStart ?? body.length;
    const to = input?.selectionEnd ?? body.length;
    const next = insertAtCursor(body, at, to, text);
    setBody(next.value);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.caret, next.caret);
    });
  };

  if (account === null) {
    return (
      <div className={styles.composer}>
        <p className="page-state-message">
          <Link href="/login">登录</Link>后可以发帖。
        </p>
      </div>
    );
  }

  const send = async (draft: boolean): Promise<void> => {
    if (body.trim().length === 0) {
      setNotice("写点什么再发。");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      /*
       * 讨论没有标题。取正文开头当标题，是为了让它在「我的作品」和
       * 通知里有个可读的名字——留空的话那些地方会出现一串「（无标题）」。
       */
      const title = body.trim().slice(0, 24);
      /*
       * 声明跟着这一次提交一起走。没选就整个字段不带——带一个 null 过去，
       * 接口那头得再判一次「null 算不算一种声明」。
       */
      const declared = disclosure === null ? {} : { disclosure };
      const response = draft
        ? await authorizedFetch("/api/social/drafts", {
            body: JSON.stringify({
              body,
              kind: "discussion",
              title,
              ...declared,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          })
        : await authorizedFetch("/api/social/posts", {
            body: JSON.stringify({ body, title, ...declared }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setNotice(data.error ?? "发布失败，请稍后再试。");
        return;
      }
      setBody("");
      /* 声明是对这一篇的承诺，发完就该清掉，不能默默带到下一篇。 */
      setDisclosure(null);
      setNotice(draft ? "已存入讨论草稿。" : null);
      await refresh();
      if (!draft) onPublished?.();
    } catch {
      setNotice("网络不通，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`${styles.composer} ${
        variant === "modal" ? styles.modal : styles.inline
      }`}
    >
      <textarea
        aria-label="发表你的观点"
        className={styles.input}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        placeholder="发表你的观点..."
        ref={inputRef}
        value={body}
      />

      {notice === null ? null : (
        <p aria-live="polite" className="page-state-message">
          {notice}
        </p>
      )}

      <div className={styles.toolbar}>
        <ComposerToolbar
          disclosure={disclosure}
          onDisclosureChange={setDisclosure}
          onInsert={insert}
        />

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => void send(true)}
            type="button"
          >
            存草稿
          </button>
          <button
            className={styles.primary}
            disabled={busy || body.trim().length === 0}
            onClick={() => void send(false)}
            type="button"
          >
            发布
          </button>
        </div>
      </div>
    </div>
  );
}
