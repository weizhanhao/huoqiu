"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";

/*
 * 关注这个组合。
 *
 * 这个按钮此前只是 dispatch 到组件自己的 useReducer：点一下文案会变成
 * 「已关注组合」，刷新就没了，「我关注的」那一栏也永远是空的。看起来
 * 成功了，其实什么都没发生——比按钮直接不响应更糟。
 *
 * 现在它落盘：POST /api/social/portfolios，与「我关注的」页签读的是同一份。
 */

type Status =
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "error"; text: string }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ followed: boolean; kind: "ready" }>;

type PortfolioRow = Readonly<{ id: string }>;

/** 只取数、不碰状态：effect、重试按钮与关注切换后的刷新共用同一段逻辑。 */
const fetchFollowStatus = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
  portfolioId: string,
): Promise<Status> => {
  try {
    const response = await authorizedFetch("/api/social/portfolios");
    if (!response.ok) {
      return response.status === 401
        ? { kind: "anonymous" }
        : { kind: "error", text: "关注状态读取不到。" };
    }
    const data = (await response.json()) as {
      followed?: readonly PortfolioRow[];
    };
    return {
      followed: (data.followed ?? []).some((row) => row.id === portfolioId),
      kind: "ready",
    };
  } catch {
    return { kind: "error", text: "关注状态读取不到。" };
  }
};

export function PortfolioFollowButton({
  portfolioId,
}: Readonly<{ portfolioId: string }>) {
  const { account, authorizedFetch } = useAccountSession();
  /* 「没登录」看 account 就够了，不必也存一份（见下面 status 的推导）。 */
  const [fetched, setFetched] = useState<Status>({ kind: "loading" });
  const [pending, setPending] = useState(false);

  /* 重试按钮与关注切换后共用；按钮回调不在 effect 里，就地改状态没问题。 */
  const load = useCallback(async (): Promise<void> => {
    setFetched(await fetchFollowStatus(authorizedFetch, portfolioId));
  }, [authorizedFetch, portfolioId]);

  /*
   * 取数做成不碰状态的纯函数（见 fetchFollowStatus），状态更新留在调用点——
   * effect 里的写入因此一定在 await 之后。顺带补上取消。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      const next = await fetchFollowStatus(authorizedFetch, portfolioId);
      if (!cancelled) setFetched(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch, portfolioId]);

  const status: Status = account === null ? { kind: "anonymous" } : fetched;

  const toggle = async (next: boolean): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      const response = await authorizedFetch("/api/social/portfolios", {
        body: JSON.stringify({ followed: next, portfolio: portfolioId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        followed?: readonly PortfolioRow[];
      };
      if (!response.ok) {
        setFetched({ kind: "error", text: data.error ?? "操作没有成功。" });
        return;
      }
      /*
       * 按服务端回来的列表定状态，而不是把本地翻个面。服务端可能什么都
       * 没记下（组合已被删就是这样），那时界面不该显示成已关注。
       */
      setFetched({
        followed: (data.followed ?? []).some((row) => row.id === portfolioId),
        kind: "ready",
      });
    } catch {
      setFetched({ kind: "error", text: "网络异常，请稍后再试。" });
    } finally {
      /*
       * pending 一定要在 finally 里放开。登录表单此前就栽在这里：
       * 网络一断按钮就永久停在「处理中」，只能刷新整页。
       */
      setPending(false);
    }
  };

  if (status.kind === "loading") {
    return (
      <p aria-live="polite" className="watchlist-hint">
        正在读取关注状态……
      </p>
    );
  }

  if (status.kind === "anonymous") {
    return (
      <p className="watchlist-hint">
        <Link href={`/login?next=/portfolios/${portfolioId}`}>登录</Link>
        后可以关注这个组合。
      </p>
    );
  }

  if (status.kind === "error") {
    return (
      <p aria-live="polite" className="watchlist-hint">
        {status.text}{" "}
        <button onClick={() => void load()} type="button">
          重试
        </button>
      </p>
    );
  }

  return (
    <button
      aria-pressed={status.followed}
      disabled={pending}
      onClick={() => void toggle(!status.followed)}
      type="button"
    >
      {pending ? "处理中…" : status.followed ? "已关注组合" : "+ 关注组合"}
    </button>
  );
}
