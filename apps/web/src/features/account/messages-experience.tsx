"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import styles from "./account.module.css";
import { useAccountSession } from "./account-session";

/*
 * 私信。
 *
 * 消息中心此前只有回复/提到/赞/系统四类，连私信分类都没有——而雪球的
 * 消息中心第一个 tab 就是私信。这里补上一对一会话。
 *
 * 只在注册账号之间收发。栏目账号背后没有人在运营，给它发消息永远等不到
 * 回复；那种「发得出去但没人会回」的入口是另一种假，所以收件人列表里
 * 只列真实注册账号。
 */

type Message = Readonly<{
  body: string;
  createdAt: string;
  fromId: string;
  id: string;
  toId: string;
}>;

type Conversation = Readonly<{
  lastAt: string;
  lastBody: string;
  partnerId: string;
  partnerName: string;
  unread: number;
}>;

const formatTime = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(parsed);
};

/**
 * 只取数、不碰状态。
 *
 * 会话归属由令牌决定，不拼进查询串。早先这里发的是 ?account=<自己的 id>，
 * 而那个 id 是公开的——换成别人的就能读走别人的全部私信。
 */
const fetchThread = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
  partner: string,
): Promise<Readonly<{
  conversations: readonly Conversation[];
  messages: readonly Message[];
}> | null> => {
  const query = new URLSearchParams();
  if (partner.length > 0) query.set("partner", partner);
  try {
    const response = await authorizedFetch(`/api/social/messages?${query}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      conversations: readonly Conversation[];
      messages: readonly Message[];
    };
    return {
      conversations: data.conversations ?? [],
      messages: data.messages ?? [],
    };
  } catch {
    return null;
  }
};

export function MessagesExperience() {
  const { account, accounts, authorizedFetch } = useAccountSession();
  const [conversations, setConversations] = useState<readonly Conversation[]>(
    [],
  );
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  /* 发出私信后的刷新用这个；它不在 effect 里，就地改状态没问题。 */
  const load = useCallback(
    async (partner: string): Promise<void> => {
      if (account === null) return;
      const result = await fetchThread(authorizedFetch, partner);
      if (result === null) {
        setError("消息加载失败，请稍后重试。");
        return;
      }
      setConversations(result.conversations);
      setMessages(result.messages);
    },
    // authorizedFetch 随登录状态变化，漏掉它会一直用登录前那个没带令牌的版本。
    [account, authorizedFetch],
  );

  /*
   * 取数做成不碰状态的纯函数（见 fetchThread），状态更新留在调用点——
   * effect 里的写入因此一定在 await 之后。顺带补上取消：原先没有，快速
   * 切换会话时先发的请求后到，会把上一个人的私信显示在这个人的窗口里。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await fetchThread(authorizedFetch, partnerId);
      if (cancelled) return;
      if (result === null) {
        setError("消息加载失败，请稍后重试。");
        return;
      }
      setConversations(result.conversations);
      setMessages(result.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch, partnerId]);

  if (account === null) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <div className={styles.heading}>
            <h1>私信</h1>
            <p>私信在注册账号之间收发，登录后即可使用。</p>
          </div>
          <Link className={styles.secondary} href="/login">
            去登录
          </Link>
        </section>
      </div>
    );
  }

  // 可选收件人不含自己；accounts 只返回注册账号，栏目账号本就不在其中。
  const recipients = accounts.filter((entry) => entry.id !== account.id);
  const partnerName =
    recipients.find((entry) => entry.id === partnerId)?.displayName ?? "";

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");
    if (partnerId.length === 0) {
      setError("请先选择收件人。");
      return;
    }
    // 发信人由令牌决定，请求体里不再带 account——带了服务端也不会看。
    const response = await authorizedFetch("/api/social/messages", {
      body: JSON.stringify({ body: draft, target: partnerId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "发送失败。");
      return;
    }
    setDraft("");
    await load(partnerId);
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <h1>私信</h1>
          <p>
            共 {conversations.length} 个会话。消息保存在本机服务端，刷新和重启
            后仍在。
          </p>
        </div>

        {conversations.length === 0 ? (
          <p className={styles.hint}>还没有会话，选一个收件人开始聊。</p>
        ) : (
          <div className={styles.directory}>
            {conversations.map((conversation) => (
              <div className={styles.directoryRow} key={conversation.partnerId}>
                <div>
                  <strong>{conversation.partnerName}</strong>
                  <small>
                    {conversation.lastBody.slice(0, 24)} ·{" "}
                    {formatTime(conversation.lastAt)}
                    {conversation.unread > 0
                      ? ` · ${conversation.unread} 条未读`
                      : ""}
                  </small>
                </div>
                <button
                  aria-pressed={partnerId === conversation.partnerId}
                  className={styles.followButton}
                  onClick={() => setPartnerId(conversation.partnerId)}
                  type="button"
                >
                  打开
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <h2>
            {partnerName.length > 0 ? `与 ${partnerName} 的会话` : "新会话"}
          </h2>
          <p>
            {recipients.length === 0
              ? "本机只有你一个注册账号，再注册一个就能互相收发。"
              : "私信只在注册账号之间收发。"}
          </p>
        </div>

        <form method="post" className={styles.form} onSubmit={send}>
          <label className={styles.field}>
            <span>收件人</span>
            <select
              onChange={(event) => setPartnerId(event.target.value)}
              value={partnerId}
            >
              <option value="">请选择</option>
              {recipients.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>

          {messages.length === 0 ? null : (
            <ol className={styles.postList}>
              {messages.map((message) => (
                <li className={styles.postRow} key={message.id}>
                  <strong>
                    {message.fromId === account.id ? "我" : partnerName}
                  </strong>
                  <p>{message.body}</p>
                  <small>{formatTime(message.createdAt)}</small>
                </li>
              ))}
            </ol>
          )}

          <label className={styles.field}>
            <span>内容</span>
            <input
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="写点什么"
              type="text"
              value={draft}
            />
          </label>

          <p
            aria-live="polite"
            className={`${styles.status} ${styles.statusError}`}
          >
            {error}
          </p>

          <button className={styles.submit} type="submit">
            发送
          </button>
        </form>
      </section>
    </div>
  );
}
