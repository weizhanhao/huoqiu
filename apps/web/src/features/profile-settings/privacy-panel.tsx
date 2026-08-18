"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 隐私设置：谁可以评论我发布的讨论。
 *
 * 五个选项与设置页截图一一对应。关键是选完之后要真的生效——服务端在
 * createComment 里按这一档判断，而不是只把值存下来。只存不执行的话，
 * 用户以为自己关掉了评论，其实谁都还能评。
 */

const OPTIONS = [
  { description: "任何已登录账号都可以评论", id: "everyone", label: "所有人" },
  { description: "只允许你已关注的账号", id: "following", label: "我关注的人" },
  { description: "只允许已关注你的账号", id: "followers", label: "关注我的人" },
  { description: "新帖子不再接收评论", id: "off", label: "关闭评论" },
  {
    description: "降低新账号骚扰，保留长期关注者互动",
    id: "followers-3d",
    label: "关注我 3 天或以上的粉丝",
  },
] as const;

/** 只取数、不碰状态。 */
const fetchPolicy = async (
  authorizedFetch: (path: string, init?: RequestInit) => Promise<Response>,
): Promise<string> => {
  try {
    const response = await authorizedFetch("/api/social/privacy", {
      cache: "no-store",
    });
    const data = (await response.json()) as { commentPolicy?: string };
    return data.commentPolicy ?? "everyone";
  } catch {
    // 读不到就按默认档渲染，不假装用户设过别的。
    return "everyone";
  }
};

export function PrivacyPanel() {
  const { account, authorizedFetch } = useAccountSession();
  /* null 表示「还没取到」，据此推导 loading，不再单独存一份。 */
  const [fetchedPolicy, setFetchedPolicy] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string>("everyone");
  /* null 表示用户还没动过单选：显示服务端那一档。 */
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  /*
   * 取数做成不碰状态的纯函数（见 fetchPolicy），状态更新留在这里——
   * effect 里的写入因此一定在 await 之后。顺带补上取消。
   */
  useEffect(() => {
    if (account === null) return undefined;
    let cancelled = false;
    void (async () => {
      const current = await fetchPolicy(authorizedFetch);
      if (cancelled) return;
      setFetchedPolicy(current);
      setPolicy(current);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, authorizedFetch]);

  /* 没登录就无从谈起「读取中」；取到之前才算在读。 */
  const loading = account !== null && fetchedPolicy === null;
  /* 用户动过就以他选的为准，否则显示服务端那一档。 */
  const choice = picked ?? policy;

  const save = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setStatus("");
    try {
      const response = await authorizedFetch("/api/social/privacy", {
        body: JSON.stringify({ commentPolicy: choice }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        commentPolicy?: string;
        error?: string;
      };
      if (!response.ok) {
        setStatus(data.error ?? "保存失败。");
        return;
      }
      setPolicy(data.commentPolicy ?? choice);
      setStatus("已保存，新的评论范围立即生效。");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="privacy-heading"
      className={styles.contentSection}
      data-testid="privacy-panel"
    >
      <div className={styles.panelIntroduction}>
        <h3 id="privacy-heading">评论权限</h3>
        <p>设置谁可以评论你新发布的讨论。</p>
      </div>

      {account === null ? (
        <Link className={styles.inverseLink} href="/login">
          登录后设置评论范围
        </Link>
      ) : loading ? (
        <div aria-label="正在读取隐私设置" className={styles.loadingState}>
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <fieldset>
            <legend className={styles.contentMeta}>
              当前：
              {OPTIONS.find(({ id }) => id === policy)?.label ?? "所有人"}
            </legend>
            {OPTIONS.map((option) => (
              <label className={styles.preferenceRow} key={option.id}>
                <input
                  checked={choice === option.id}
                  name="comment-policy"
                  onChange={() => setPicked(option.id)}
                  type="radio"
                  value={option.id}
                />
                <span className={styles.optionCopy}>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {/* 截图上的脚注：转发路径也受这条范围约束，不说清楚会让人以为有绕过口。 */}
          <p className={styles.contentMeta}>
            *
            设置回复范围后，不在限定范围内的其他人转发你的帖子时也将无法添加回复内容。
          </p>

          <button
            className={styles.primaryButton}
            disabled={pending}
            onClick={() => void save()}
            type="button"
          >
            {pending ? "保存中" : "确定"}
          </button>
        </>
      )}

      {status === "" ? null : (
        <p aria-live="polite" className={styles.statusMessage}>
          {status}
        </p>
      )}
    </section>
  );
}
