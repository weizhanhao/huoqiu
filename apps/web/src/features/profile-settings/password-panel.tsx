"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 修改登录密码。
 *
 * 截图上只有「新密码 / 确认密码」两栏。这里多了一栏当前密码，是刻意加的：
 * 少了它，任何拿到会话的人——借用的电脑、被偷的令牌——都能直接改掉密码，
 * 把真正的机主锁在外面。少一个输入框换来的是账号可被劫持。
 *
 * 改成功后服务端会作废此前所有令牌并回签一张新的，这里立刻换上，
 * 否则用户改完密码会被自己刚才那张作废的票踢下线。
 */

const MINIMUM_LENGTH = 12;

export function PasswordPanel() {
  const { account, adoptToken, authorizedFetch } = useAccountSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setStatus("");

    // 界面先挡一道，服务端还会再查一遍——只有界面校验等于没有校验。
    if (next !== confirmation) {
      setStatus("两次输入的新密码不一致。");
      return;
    }
    if (next.length < MINIMUM_LENGTH) {
      setStatus(`新密码至少 ${MINIMUM_LENGTH} 位。`);
      return;
    }

    setPending(true);
    try {
      const response = await authorizedFetch("/api/social/password", {
        body: JSON.stringify({
          confirm_password: confirmation,
          current_password: current,
          new_password: next,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        token?: string;
      };
      if (!response.ok) {
        setStatus(data.error ?? "修改失败。");
        return;
      }
      if (typeof data.token === "string") adoptToken(data.token);
      setCurrent("");
      setNext("");
      setConfirmation("");
      setStatus("密码已修改，其他设备上的登录已同时失效。");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="password-heading"
      className={styles.contentSection}
      data-testid="password-panel"
    >
      <div className={styles.panelIntroduction}>
        <h3 id="password-heading">更换登录密码</h3>
        <p>保存后会退出其他设备，当前设备保持登录。</p>
      </div>

      {account === null ? (
        <Link className={styles.inverseLink} href="/login">
          登录后修改密码
        </Link>
      ) : (
        <form method="post" onSubmit={submit}>
          {/* 截图里没有这一栏。加它是因为：不验旧口令，拿到会话就能改密码。 */}
          <div className={styles.formField}>
            <label htmlFor="current-password">当前密码</label>
            <input
              autoComplete="current-password"
              id="current-password"
              onChange={(event) => setCurrent(event.target.value)}
              required
              type="password"
              value={current}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="new-password">新密码</label>
            <input
              autoComplete="new-password"
              id="new-password"
              minLength={MINIMUM_LENGTH}
              onChange={(event) => setNext(event.target.value)}
              required
              type="password"
              value={next}
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="confirm-password">确认密码</label>
            <input
              autoComplete="new-password"
              id="confirm-password"
              minLength={MINIMUM_LENGTH}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </div>

          <button
            className={styles.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? "保存中" : "保存"}
          </button>
        </form>
      )}

      {status === "" ? null : (
        <p aria-live="polite" className={styles.statusMessage}>
          {status}
        </p>
      )}
    </section>
  );
}
