"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 已屏蔽用户。
 *
 * 页面上这句「已屏蔽用户不能对你进行关注、评论、私信等操作」以前是假的：
 * 屏蔽只存在浏览器 localStorage 里，换台设备就没了，服务端一无所知，
 * 那三个接口照样放行——它实际只把对方的内容从我这边藏起来。
 *
 * 现在名单落盘，拦截在关注、评论、私信三个接口里真正执行。
 */

type BlockedUser = Readonly<{
  blockedId: string;
  createdAt: string;
  displayName: string;
}>;

/** 只取数、不碰状态：effect 与解除屏蔽后的刷新共用同一段逻辑。 */
const fetchBlocked = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<readonly BlockedUser[]> => {
  try {
    const response = await authorizedFetch("/api/social/blocks", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      blocked?: readonly BlockedUser[];
    };
    return data.blocked ?? [];
  } catch {
    // 拉不到就保持空列表，不编条目混进真实名单里。
    return [];
  }
};

export function BlockedUsersPanel() {
  const { account, authorizedFetch } = useAccountSession();
  /* null 表示「还没取到」，据此推导 loading，不再单独存一份。 */
  const [fetched, setFetched] = useState<readonly BlockedUser[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  /*
   * 取数做成不碰状态的纯函数（见 fetchBlocked），状态更新留在调用点——
   * effect 里的写入因此一定在 await 之后。顺带补上取消。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      const rows = await fetchBlocked(authorizedFetch);
      if (!cancelled) setFetched(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  /* 没登录就无从谈起「读取中」；取到之前才算在读。 */
  const loading = account !== null && fetched === null;
  const blocked = fetched ?? [];

  const unblock = async (blockedId: string): Promise<void> => {
    if (pending !== "") return;
    setPending(blockedId);
    setError("");
    try {
      const response = await authorizedFetch("/api/social/blocks", {
        body: JSON.stringify({ blocked: false, target: blockedId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "解除失败。");
        return;
      }
      setFetched(await fetchBlocked(authorizedFetch));
    } finally {
      setPending("");
    }
  };

  return (
    <section
      aria-labelledby="blocked-users-heading"
      className={styles.contentSection}
      data-testid="blocked-users-panel"
    >
      <div className={styles.panelIntroduction}>
        <h3 id="blocked-users-heading">已屏蔽账号</h3>
        <p>屏蔽后，对方无法关注、评论或私信你。</p>
      </div>

      {account === null ? (
        <Link className={styles.inverseLink} href="/login">
          登录后管理屏蔽名单
        </Link>
      ) : loading ? (
        <div aria-label="正在读取屏蔽名单" className={styles.loadingState}>
          <span />
          <span />
          <span />
        </div>
      ) : blocked.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>没有已屏蔽的账号</strong>
          <span>你在用户主页屏蔽的账号会出现在这里。</span>
        </div>
      ) : (
        <ul className={styles.contentList}>
          {blocked.map((entry) => (
            <li className={styles.contentItem} key={entry.blockedId}>
              <Link
                className={styles.contentLink}
                href={`/users/${entry.blockedId}`}
              >
                {entry.displayName}
              </Link>
              <button
                className={styles.secondaryButton}
                disabled={pending === entry.blockedId}
                onClick={() => void unblock(entry.blockedId)}
                type="button"
              >
                {pending === entry.blockedId ? "解除中" : "解除屏蔽"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error === "" ? null : (
        <p aria-live="polite" className={styles.fieldError}>
          {error}
        </p>
      )}
    </section>
  );
}
