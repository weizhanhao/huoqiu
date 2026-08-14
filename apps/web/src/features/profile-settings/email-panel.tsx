"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAccountSession } from "../account/account-session";
import styles from "./profile-settings.module.css";

/*
 * 修改登录邮箱。
 *
 * 账号绑定那一页上有三项：登录邮箱、手机号、微信。后两项本机接不了
 * （没有短信通道、没有开放平台资质），能做真的只有这一项。
 *
 * 这里要求填当前密码，和改口令那一页是同一个理由：改登录邮箱等于改登录
 * 入口，只凭一个已登录的会话就能改掉它，那么任何一次会话泄露都会直接
 * 变成账号被夺走——真正的机主连登录都做不到了。
 */
export function EmailPanel() {
  const { account, authorizedFetch, refresh } = useAccountSession();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setStatus("");
    setPending(true);
    try {
      const response = await authorizedFetch("/api/social/email", {
        body: JSON.stringify({ current_password: password, email }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        email?: string;
        error?: string;
      };
      if (!response.ok) {
        setStatus(data.error ?? "修改失败，请稍后再试。");
        return;
      }
      setStatus(`登录邮箱已改为 ${data.email ?? email}。`);
      setPassword("");
      setEmail("");
      /*
       * 重新拉一次账号资料。
       *
       * 少了这一步，提示说「已改为 new@x.com」，而上面那行「当前登录邮箱」
       * 还显示旧地址——用户会以为没改成功，或者更糟：以为自己有两个邮箱。
       */
      await refresh();
    } catch {
      setStatus("网络异常，请稍后再试。");
    } finally {
      setPending(false);
    }
  };

  if (account === null) {
    return (
      <p className={styles.hint}>
        <Link href="/login">登录</Link>后可以修改登录邮箱。
      </p>
    );
  }

  return (
    <form
      method="post"
      className={styles.form}
      onSubmit={(event) => void submit(event)}
    >
      <p className={styles.hint}>
        当前登录邮箱：<strong>{account.email}</strong>
      </p>

      <label htmlFor="email-current-password">当前密码</label>
      <input
        autoComplete="current-password"
        id="email-current-password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />

      <label htmlFor="email-next">新的登录邮箱</label>
      <input
        autoComplete="email"
        id="email-next"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />

      <button disabled={pending} type="submit">
        {pending ? "提交中…" : "保存"}
      </button>

      {status === "" ? null : (
        <p aria-live="polite" className={styles.hint}>
          {status}
        </p>
      )}
    </form>
  );
}
