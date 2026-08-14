"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 消息提醒设置。
 *
 * 五个分类与通知页的页签一一对应。关掉之后要真的不再出现在通知列表里——
 * 只在界面上藏起来，未读计数照样会跳，徽标上挂着一个点开什么都没有的数字。
 * 所以过滤做在服务端的 listNotifications 里。
 */

const CATEGORIES = [
  { id: "replies", label: "回复我的" },
  { id: "mentions", label: "提到我的" },
  { id: "likes", label: "赞我的" },
  { id: "follows", label: "新增粉丝" },
  { id: "system", label: "系统消息" },
] as const;

/** 只取数、不碰状态。 */
const fetchMuted = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<readonly string[]> => {
  try {
    const response = await authorizedFetch("/api/social/privacy", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      mutedCategories?: readonly string[];
    };
    return data.mutedCategories ?? [];
  } catch {
    // 读不到就按「全部开启」渲染，不假装用户关过什么。
    return [];
  }
};

export function NotificationPrefsPanel() {
  const { account, authorizedFetch } = useAccountSession();
  /* null 表示「还没取到」，据此推导 loading，不再单独存一份。 */
  const [fetched, setFetched] = useState<readonly string[] | null>(null);
  const [saved, setSaved] = useState<readonly string[] | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  /*
   * 取数做成不碰状态的纯函数（见 fetchMuted），状态更新留在这里——
   * effect 里的写入因此一定在 await 之后。顺带补上取消。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      const rows = await fetchMuted(authorizedFetch);
      if (!cancelled) setFetched(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  /* 没登录就无从谈起「读取中」；取到之前才算在读。 */
  const loading = account !== null && fetched === null;
  /* 保存过就以保存结果为准，否则用取回来的那一份。 */
  const muted = saved ?? fetched ?? [];

  const save = async (next: readonly string[]): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");
    try {
      const response = await authorizedFetch("/api/social/privacy", {
        body: JSON.stringify({ mutedCategories: next }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        mutedCategories?: readonly string[];
      };
      if (!response.ok) {
        setStatus(data.error ?? "保存失败。");
        return;
      }
      setSaved(data.mutedCategories ?? next);
      setStatus("已保存，关闭的分类不会再出现在消息中心。");
    } finally {
      setPending(false);
    }
  };

  const toggle = (id: string): void => {
    const next = muted.includes(id)
      ? muted.filter((category) => category !== id)
      : [...muted, id];
    /* 先按点击结果显示，再发请求：等一趟往返才变化，开关会像卡住。 */
    setSaved(next);
    void save(next);
  };

  return (
    <section
      aria-labelledby="notification-prefs-heading"
      className={styles.contentSection}
      data-testid="notification-prefs-panel"
    >
      <h3 className={styles.sectionHeading} id="notification-prefs-heading">
        消息提醒设置
      </h3>

      {account === null ? (
        <Link className={styles.inverseLink} href="/login">
          登录后设置消息提醒
        </Link>
      ) : loading ? (
        <p className={styles.contentMeta}>读取中…</p>
      ) : (
        <fieldset>
          <legend className={styles.contentMeta}>
            关闭后，该分类不再出现在消息中心，也不计入未读。
          </legend>
          {CATEGORIES.map((category) => (
            <label className={styles.preferenceRow} key={category.id}>
              <input
                checked={!muted.includes(category.id)}
                disabled={pending}
                onChange={() => toggle(category.id)}
                type="checkbox"
              />
              <span>{category.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {status === "" ? null : (
        <p aria-live="polite" className={styles.contentMeta}>
          {status}
        </p>
      )}
    </section>
  );
}
