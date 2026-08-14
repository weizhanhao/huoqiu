"use client";

import Link from "next/link";
import { useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./community-experience.module.css";

/*
 * 转发。
 *
 * 卡片上的「N 转发」此前只是个静态数字——雪球的转发是核心传播动作，
 * 这里把它做成真的：转发会生成一条属于你自己的帖子，正文是你的转发语，
 * 原帖以引用块保留在下面，出现在你的主页和社区流里，刷新后仍在。
 *
 * 未登录时给通往 /login 的真链接，而不是禁用按钮——「点了没反应」正是
 * 要消灭的东西。
 */
export function RepostButton({
  postId,
  postTitle,
}: Readonly<{ postId: string; postTitle: string }>) {
  const { account, publish } = useAccountSession();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  if (account === null) {
    return (
      <Link className={styles.action} href="/login">
        登录后转发
      </Link>
    );
  }

  const submit = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");
    const said = comment.trim();
    const failure = await publish(
      `转发：${postTitle}`.slice(0, 60),
      // 不写转发语时留一个明确的默认值，而不是发一条空正文。
      said.length > 0 ? said : "转发",
      postId,
    );
    setPending(false);
    if (failure !== null) {
      setStatus(failure);
      return;
    }
    setComment("");
    setOpen(false);
    setStatus("已转发到你的主页");
  };

  return (
    <span className={styles.repostSlot}>
      <button
        aria-expanded={open}
        className={styles.action}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        转发
      </button>
      {open ? (
        <span className={styles.repostComposer}>
          <input
            aria-label={`转发《${postTitle}》时想说的话`}
            maxLength={200}
            onChange={(event) => setComment(event.target.value)}
            placeholder="说点什么（可留空）"
            type="text"
            value={comment}
          />
          <button
            className={styles.action}
            disabled={pending}
            onClick={submit}
            type="button"
          >
            {pending ? "发送中" : "确认转发"}
          </button>
        </span>
      ) : null}
      {status === "" ? null : (
        <span aria-live="polite" className={styles.meta}>
          {status}
        </span>
      )}
    </span>
  );
}
