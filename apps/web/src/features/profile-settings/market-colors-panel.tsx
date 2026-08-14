"use client";

import { useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 股票设置：涨跌配色。
 *
 * 默认红涨绿跌（A 股习惯）。切换要在全站生效——涨跌幅文字、标签底色描边、
 * K 线蜡烛都由同一组 --hq-market-* 变量驱动，所以在根元素上换一个属性就够，
 * 不需要逐个组件改。只换文字不换蜡烛，正是那种看起来做了、实际做一半。
 *
 * 存两处，职责不同：
 *   localStorage —— 供首帧预涂。不预涂的话，设成绿涨红跌的人会先看到一帧
 *                   红色再翻绿，而那一帧传达的信息完全相反。
 *   账号         —— 供跨设备。换台机器登录仍是自己选的那套。
 */

const STORAGE_KEY = "huoqiu.market-colors";

const OPTIONS = [
  { id: "green-up", label: "绿涨红跌" },
  { id: "red-up", label: "红涨绿跌" },
] as const;

const applyToDocument = (mode: string): void => {
  const root = globalThis.document?.documentElement;
  if (root === undefined) return;
  if (mode === "green-up") {
    root.dataset.marketColors = "green-up";
  } else {
    delete root.dataset.marketColors;
  }
};

/** 只取数、不碰状态；读不到或值不认识都回 null，让调用方维持本地那套。 */
const fetchMarketColors = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> => {
  try {
    const response = await authorizedFetch("/api/social/privacy", {
      cache: "no-store",
    });
    const data = (await response.json()) as { marketColors?: string };
    const remote = data.marketColors;
    return remote === "green-up" || remote === "red-up" ? remote : null;
  } catch {
    return null;
  }
};

export function MarketColorsPanel() {
  const { account, authorizedFetch } = useAccountSession();
  const [choice, setChoice] = useState<string>("red-up");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  /*
   * 取数做成不碰状态的纯函数（见 fetchMarketColors），状态更新留在这里——
   * effect 里的写入因此一定在 await 之后。
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 先认本地：它就是这一帧正在显示的那套。
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!cancelled && (stored === "green-up" || stored === "red-up")) {
        setChoice(stored);
      }
      if (account === null) return;

      // 读账号是为了纠正跨设备的差异；读不到就维持本地那套。
      const remote = await fetchMarketColors(authorizedFetch);
      if (cancelled || remote === null) return;
      setChoice(remote);
      globalThis.localStorage?.setItem(STORAGE_KEY, remote);
      applyToDocument(remote);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  const save = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");

    // 本地与界面立刻生效，不等网络——这是个纯显示偏好，没有等待的理由。
    globalThis.localStorage?.setItem(STORAGE_KEY, choice);
    applyToDocument(choice);

    if (account === null) {
      setPending(false);
      setStatus("已在本机生效；登录后可跨设备同步。");
      return;
    }

    try {
      const response = await authorizedFetch("/api/social/privacy", {
        body: JSON.stringify({ marketColors: choice }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      setStatus(
        response.ok
          ? "已保存，换设备登录也是这套配色。"
          : (data.error ?? "保存失败，但本机已生效。"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="market-colors-heading"
      className={styles.contentSection}
      data-testid="market-colors-panel"
    >
      <h3 className={styles.sectionHeading} id="market-colors-heading">
        颜色设置
      </h3>

      <fieldset>
        <legend className={styles.contentMeta}>涨跌配色</legend>
        {OPTIONS.map((option) => (
          <label className={styles.preferenceRow} key={option.id}>
            <input
              checked={choice === option.id}
              name="market-colors"
              onChange={() => setChoice(option.id)}
              type="radio"
              value={option.id}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <button
        className={styles.primaryButton}
        disabled={pending}
        onClick={() => void save()}
        type="button"
      >
        {pending ? "保存中" : "确定"}
      </button>

      {status === "" ? null : (
        <p aria-live="polite" className={styles.contentMeta}>
          {status}
        </p>
      )}
    </section>
  );
}
